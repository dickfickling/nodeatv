const _SIZED_INT_TYPES = new Map<number, { new (value: number): SizedInt }>();

interface SizedInt {
	size: number;
	valueOf(): number;
}

class SizedIntImpl {
	private _value: number;
	size: number;

	constructor(value: number, size: number) {
		this._value = value;
		this.size = size;
	}

	valueOf(): number {
		return this._value;
	}

	toString(): string {
		return String(this._value);
	}
}

export function sizedInt(value: number, size: number): number {
	const si = new SizedIntImpl(value, size);
	return si as unknown as number;
}

function getSizeHint(data: unknown): number | undefined {
	if (data instanceof SizedIntImpl) {
		return data.size;
	}
	return undefined;
}

function isUUID(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			value,
		)
	);
}

function uuidToBytes(uuid: string): Buffer {
	return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function bytesToUuid(buf: Buffer): string {
	const hex = buf.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function intToLE(value: number, byteLength: number): Buffer {
	const buf = Buffer.alloc(byteLength);
	if (byteLength <= 6) {
		buf.writeUIntLE(value, 0, byteLength);
	} else {
		buf.writeBigUInt64LE(BigInt(value));
	}
	return buf;
}

function intFromLE(data: Buffer, offset: number, byteLength: number): number {
	if (byteLength <= 6) {
		return data.readUIntLE(offset, byteLength);
	}
	return Number(data.readBigUInt64LE(offset));
}

export function pack(data: unknown): Buffer {
	return _pack(data, []);
}

function _pack(data: unknown, objectList: Buffer[]): Buffer {
	let packedBytes: Buffer | null = null;

	if (data === null || data === undefined) {
		packedBytes = Buffer.from([0x04]);
	} else if (typeof data === "boolean") {
		packedBytes = Buffer.from([data ? 1 : 2]);
	} else if (isUUID(data)) {
		packedBytes = Buffer.concat([Buffer.from([0x05]), uuidToBytes(data)]);
	} else if (typeof data === "number" && !Number.isInteger(data)) {
		// float64
		const buf = Buffer.alloc(9);
		buf[0] = 0x36;
		buf.writeDoubleLE(data, 1);
		packedBytes = buf;
	} else if (data instanceof SizedIntImpl || typeof data === "number") {
		const num = Number(data);
		const sizeHint = getSizeHint(data);
		if (num < 0x28 && !sizeHint) {
			packedBytes = Buffer.from([num + 8]);
		} else if ((num <= 0xff && !sizeHint) || sizeHint === 1) {
			packedBytes = Buffer.concat([Buffer.from([0x30]), intToLE(num, 1)]);
		} else if ((num <= 0xffff && !sizeHint) || sizeHint === 2) {
			packedBytes = Buffer.concat([Buffer.from([0x31]), intToLE(num, 2)]);
		} else if ((num <= 0xffffffff && !sizeHint) || sizeHint === 4) {
			packedBytes = Buffer.concat([Buffer.from([0x32]), intToLE(num, 4)]);
		} else {
			packedBytes = Buffer.concat([Buffer.from([0x33]), intToLE(num, 8)]);
		}
	} else if (typeof data === "string") {
		const encoded = Buffer.from(data, "utf-8");
		if (encoded.length <= 0x20) {
			packedBytes = Buffer.concat([
				Buffer.from([0x40 + encoded.length]),
				encoded,
			]);
		} else if (encoded.length <= 0xff) {
			packedBytes = Buffer.concat([
				Buffer.from([0x61]),
				intToLE(encoded.length, 1),
				encoded,
			]);
		} else if (encoded.length <= 0xffff) {
			packedBytes = Buffer.concat([
				Buffer.from([0x62]),
				intToLE(encoded.length, 2),
				encoded,
			]);
		} else if (encoded.length <= 0xffffff) {
			packedBytes = Buffer.concat([
				Buffer.from([0x63]),
				intToLE(encoded.length, 3),
				encoded,
			]);
		} else {
			packedBytes = Buffer.concat([
				Buffer.from([0x64]),
				intToLE(encoded.length, 4),
				encoded,
			]);
		}
	} else if (Buffer.isBuffer(data)) {
		if (data.length <= 0x20) {
			packedBytes = Buffer.concat([Buffer.from([0x70 + data.length]), data]);
		} else if (data.length <= 0xff) {
			packedBytes = Buffer.concat([
				Buffer.from([0x91]),
				intToLE(data.length, 1),
				data,
			]);
		} else if (data.length <= 0xffff) {
			packedBytes = Buffer.concat([
				Buffer.from([0x92]),
				intToLE(data.length, 2),
				data,
			]);
		} else if (data.length <= 0xffffffff) {
			packedBytes = Buffer.concat([
				Buffer.from([0x93]),
				intToLE(data.length, 4),
				data,
			]);
		} else {
			packedBytes = Buffer.concat([
				Buffer.from([0x94]),
				intToLE(data.length, 8),
				data,
			]);
		}
	} else if (Array.isArray(data)) {
		const parts: Buffer[] = [Buffer.from([0xd0 + Math.min(data.length, 0xf)])];
		for (const item of data) {
			parts.push(_pack(item, objectList));
		}
		if (data.length >= 0xf) {
			parts.push(Buffer.from([0x03]));
		}
		packedBytes = Buffer.concat(parts);
	} else if (data instanceof Date) {
		throw new TypeError("absolute time not implemented");
	} else if (
		typeof data === "object" &&
		!Array.isArray(data) &&
		!Buffer.isBuffer(data)
	) {
		if (
			data instanceof Set ||
			data instanceof WeakMap ||
			data instanceof WeakSet
		) {
			throw new TypeError(String(data.constructor.name));
		}
		const entries =
			data instanceof Map ? [...data.entries()] : Object.entries(data);
		const parts: Buffer[] = [
			Buffer.from([0xe0 + Math.min(entries.length, 0xf)]),
		];
		for (const [k, v] of entries) {
			parts.push(_pack(k, objectList));
			parts.push(_pack(v, objectList));
		}
		if (entries.length >= 0xf) {
			parts.push(Buffer.from([0x03]));
		}
		packedBytes = Buffer.concat(parts);
	} else {
		throw new TypeError(String(typeof data));
	}

	// UID referencing
	const idx = objectList.findIndex((b) => b.equals(packedBytes!));
	if (idx >= 0) {
		if (idx < 0x21) {
			packedBytes = Buffer.from([0xa0 + idx]);
		} else if (idx <= 0xff) {
			packedBytes = Buffer.concat([Buffer.from([0xc1]), intToLE(idx, 1)]);
		} else if (idx <= 0xffff) {
			packedBytes = Buffer.concat([Buffer.from([0xc2]), intToLE(idx, 2)]);
		} else if (idx <= 0xffffffff) {
			packedBytes = Buffer.concat([Buffer.from([0xc3]), intToLE(idx, 4)]);
		} else {
			packedBytes = Buffer.concat([Buffer.from([0xc4]), intToLE(idx, 8)]);
		}
	} else if (packedBytes.length > 1) {
		objectList.push(packedBytes);
	}

	return packedBytes;
}

export function unpack(data: Buffer): [unknown, Buffer] {
	return _unpack(data, []);
}

function _unpack(data: Buffer, objectList: unknown[]): [unknown, Buffer] {
	let value: unknown = null;
	let remaining: Buffer | null = null;
	let addToObjectList = true;

	const tag = data[0];

	if (tag === 0x01) {
		value = true;
		remaining = data.subarray(1);
		addToObjectList = false;
	} else if (tag === 0x02) {
		value = false;
		remaining = data.subarray(1);
		addToObjectList = false;
	} else if (tag === 0x04) {
		value = null;
		remaining = data.subarray(1);
		addToObjectList = false;
	} else if (tag === 0x05) {
		value = bytesToUuid(data.subarray(1, 17));
		remaining = data.subarray(17);
	} else if (tag === 0x06) {
		// absolute time — parse as integer (not fully implemented)
		value = intFromLE(data, 1, 8);
		remaining = data.subarray(9);
	} else if (tag >= 0x08 && tag <= 0x2f) {
		value = tag - 8;
		remaining = data.subarray(1);
		addToObjectList = false;
	} else if (tag === 0x35) {
		value = data.readFloatLE(1);
		remaining = data.subarray(5);
	} else if (tag === 0x36) {
		value = data.readDoubleLE(1);
		remaining = data.subarray(9);
	} else if ((tag & 0xf0) === 0x30) {
		const nBytes = 2 ** (tag & 0xf);
		const num = intFromLE(data, 1, nBytes);
		value = sizedInt(num, nBytes);
		remaining = data.subarray(1 + nBytes);
	} else if (tag >= 0x40 && tag <= 0x60) {
		const length = tag - 0x40;
		value = data.subarray(1, 1 + length).toString("utf-8");
		remaining = data.subarray(1 + length);
	} else if (tag > 0x60 && tag <= 0x64) {
		const nBytes = tag & 0xf;
		const length = intFromLE(data, 1, nBytes);
		value = data.subarray(1 + nBytes, 1 + nBytes + length).toString("utf-8");
		remaining = data.subarray(1 + nBytes + length);
	} else if (tag >= 0x70 && tag <= 0x90) {
		const length = tag - 0x70;
		value = Buffer.from(data.subarray(1, 1 + length));
		remaining = data.subarray(1 + length);
	} else if (tag >= 0x91 && tag <= 0x94) {
		const nBytes = 1 << ((tag & 0xf) - 1);
		const length = intFromLE(data, 1, nBytes);
		value = Buffer.from(data.subarray(1 + nBytes, 1 + nBytes + length));
		remaining = data.subarray(1 + nBytes + length);
	} else if ((tag & 0xf0) === 0xd0) {
		const count = tag & 0xf;
		const output: unknown[] = [];
		let ptr = data.subarray(1);
		if (count === 0xf) {
			while (ptr[0] !== 0x03) {
				const [v, rest] = _unpack(ptr, objectList);
				output.push(v);
				ptr = rest;
			}
			ptr = ptr.subarray(1);
		} else {
			for (let i = 0; i < count; i++) {
				const [v, rest] = _unpack(ptr, objectList);
				output.push(v);
				ptr = rest;
			}
		}
		value = output;
		remaining = ptr;
		addToObjectList = false;
	} else if ((tag & 0xe0) === 0xe0) {
		const count = tag & 0xf;
		const output: Record<string, unknown> = {};
		let ptr = data.subarray(1);
		if (count === 0xf) {
			while (ptr[0] !== 0x03) {
				const [k, rest1] = _unpack(ptr, objectList);
				const [v, rest2] = _unpack(rest1, objectList);
				output[String(k)] = v;
				ptr = rest2;
			}
			ptr = ptr.subarray(1);
		} else {
			for (let i = 0; i < count; i++) {
				const [k, rest1] = _unpack(ptr, objectList);
				const [v, rest2] = _unpack(rest1, objectList);
				output[String(k)] = v;
				ptr = rest2;
			}
		}
		value = output;
		remaining = ptr;
		addToObjectList = false;
	} else if (tag >= 0xa0 && tag <= 0xc0) {
		value = objectList[tag - 0xa0];
		remaining = data.subarray(1);
	} else if (tag >= 0xc1 && tag <= 0xc4) {
		const length = tag - 0xc0;
		const uid = intFromLE(data, 1, length);
		value = objectList[uid];
		remaining = data.subarray(1 + length);
	} else {
		throw new TypeError(`0x${tag.toString(16)}`);
	}

	if (addToObjectList && !objectList.includes(value)) {
		objectList.push(value);
	}

	return [value, remaining as Buffer];
}
