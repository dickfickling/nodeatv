const FORMAT_SIZES: Record<string, number> = {
	b: 1,
	B: 1,
	h: 2,
	H: 2,
	i: 4,
	I: 4,
	q: 8,
	Q: 8,
	c: 1,
};

interface DecodedPacket {
	[key: string]: number | Buffer;
}

export interface PacketType {
	length: number;
	decode(data: Buffer, allowExcessive?: boolean): DecodedPacket;
	encode(...args: (number | Buffer)[]): Buffer;
	extend(extName: string, extFields: Record<string, string>): PacketType;
}

function readField(buf: Buffer, offset: number, fmt: string): number | Buffer {
	switch (fmt) {
		case "c":
			return buf.subarray(offset, offset + 1);
		case "b":
			return buf.readInt8(offset);
		case "B":
			return buf.readUInt8(offset);
		case "h":
			return buf.readInt16BE(offset);
		case "H":
			return buf.readUInt16BE(offset);
		case "i":
			return buf.readInt32BE(offset);
		case "I":
			return buf.readUInt32BE(offset);
		case "q":
			return Number(buf.readBigInt64BE(offset));
		case "Q":
			return Number(buf.readBigUInt64BE(offset));
		default:
			throw new Error(`unsupported format: ${fmt}`);
	}
}

function writeField(
	buf: Buffer,
	offset: number,
	fmt: string,
	value: number | Buffer,
): void {
	switch (fmt) {
		case "c":
			(value as Buffer).copy(buf, offset, 0, 1);
			break;
		case "b":
			buf.writeInt8(value as number, offset);
			break;
		case "B":
			buf.writeUInt8(value as number, offset);
			break;
		case "h":
			buf.writeInt16BE(value as number, offset);
			break;
		case "H":
			buf.writeUInt16BE(value as number, offset);
			break;
		case "i":
			buf.writeInt32BE(value as number, offset);
			break;
		case "I":
			buf.writeUInt32BE(value as number, offset);
			break;
		case "q":
			buf.writeBigInt64BE(BigInt(value as number), offset);
			break;
		case "Q":
			buf.writeBigUInt64BE(BigInt(value as number), offset);
			break;
		default:
			throw new Error(`unsupported format: ${fmt}`);
	}
}

export function defpacket(
	_name: string,
	fields: Record<string, string>,
): PacketType {
	const fieldNames = Object.keys(fields);
	const formats = Object.values(fields);
	const totalLength = formats.reduce(
		(sum, f) => sum + (FORMAT_SIZES[f] ?? 0),
		0,
	);

	return {
		length: totalLength,

		decode(data: Buffer, allowExcessive = false): DecodedPacket {
			const buf = allowExcessive ? data.subarray(0, totalLength) : data;
			const result: DecodedPacket = {};
			let offset = 0;
			for (let i = 0; i < fieldNames.length; i++) {
				result[fieldNames[i]] = readField(buf, offset, formats[i]);
				offset += FORMAT_SIZES[formats[i]];
			}
			return result;
		},

		encode(...args: (number | Buffer)[]): Buffer {
			const buf = Buffer.alloc(totalLength);
			let offset = 0;
			for (let i = 0; i < formats.length; i++) {
				writeField(buf, offset, formats[i], args[i]);
				offset += FORMAT_SIZES[formats[i]];
			}
			return buf;
		},

		extend(extName: string, extFields: Record<string, string>): PacketType {
			return defpacket(extName, { ...fields, ...extFields });
		},
	};
}
