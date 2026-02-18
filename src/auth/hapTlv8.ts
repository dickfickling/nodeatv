export enum TlvValue {
	Method = 0x00,
	Identifier = 0x01,
	Salt = 0x02,
	PublicKey = 0x03,
	Proof = 0x04,
	EncryptedData = 0x05,
	SeqNo = 0x06,
	Error = 0x07,
	BackOff = 0x08,
	Certificate = 0x09,
	Signature = 0x0a,
	Permissions = 0x0b,
	FragmentData = 0x0c,
	FragmentLast = 0x0d,
	Name = 0x11,
	Flags = 0x13,
}

export enum Flags {
	TransientPairing = 0x10,
}

export enum ErrorCode {
	Unknown = 0x01,
	Authentication = 0x02,
	BackOff = 0x03,
	MaxPeers = 0x04,
	MaxTries = 0x05,
	Unavailable = 0x06,
	Busy = 0x07,
}

export enum Method {
	PairSetup = 0x00,
	PairSetupWithAuth = 0x01,
	PairVerify = 0x02,
	AddPairing = 0x03,
	RemovePairing = 0x04,
	ListPairing = 0x05,
}

export enum State {
	M1 = 0x01,
	M2 = 0x02,
	M3 = 0x03,
	M4 = 0x04,
	M5 = 0x05,
	M6 = 0x06,
}

export function readTlv(data: Buffer): Map<number, Buffer> {
	const result = new Map<number, Buffer>();

	let pos = 0;
	while (pos < data.length) {
		const tag = data[pos];
		const length = data[pos + 1];
		const value = data.subarray(pos + 2, pos + 2 + length);

		if (result.has(tag)) {
			result.set(tag, Buffer.concat([result.get(tag)!, value]));
		} else {
			result.set(tag, Buffer.from(value));
		}
		pos += 2 + length;
	}

	return result;
}

export function writeTlv(data: Map<number, Buffer>): Buffer {
	const parts: Buffer[] = [];

	for (const [key, value] of data) {
		const tag = Buffer.from([key]);
		let remaining = value.length;
		let pos = 0;

		while (pos < value.length) {
			const size = Math.min(remaining, 255);
			parts.push(tag);
			parts.push(Buffer.from([size]));
			parts.push(value.subarray(pos, pos + size));
			pos += size;
			remaining -= size;
		}
	}

	return Buffer.concat(parts);
}

function enumValueName(value: number, enumObj: Record<string, number>): string {
	for (const [name, v] of Object.entries(enumObj)) {
		if (v === value && typeof name === "string" && Number.isNaN(Number(name))) {
			return name;
		}
	}
	return `0x${value.toString(16)}`;
}

const _tlvValueSet = new Set(
	Object.values(TlvValue).filter((v) => typeof v === "number"),
);
const tlvNameMap = new Map<number, string>();
for (const [name, value] of Object.entries(TlvValue)) {
	if (typeof value === "number" && Number.isNaN(Number(name))) {
		tlvNameMap.set(value, name);
	}
}

export function stringify(data: Map<number, Buffer>): string {
	const output: string[] = [];

	for (const [key, value] of data) {
		const keyName = tlvNameMap.get(key);
		if (!keyName) {
			output.push(`0x${key.toString(16)}=${value.length}bytes`);
		} else if (key === TlvValue.Method) {
			const method = value.readUIntLE(0, value.length);
			output.push(
				`${keyName}=${enumValueName(method, Method as unknown as Record<string, number>)}`,
			);
		} else if (key === TlvValue.SeqNo) {
			const seqno = value.readUIntLE(0, value.length);
			output.push(
				`${keyName}=${enumValueName(seqno, State as unknown as Record<string, number>)}`,
			);
		} else if (key === TlvValue.Error) {
			const code = value.readUIntLE(0, value.length);
			output.push(
				`${keyName}=${enumValueName(code, ErrorCode as unknown as Record<string, number>)}`,
			);
		} else if (key === TlvValue.BackOff) {
			const seconds = value.readUIntLE(0, value.length);
			output.push(`${keyName}=${seconds}s`);
		} else {
			output.push(`${keyName}=${value.length}bytes`);
		}
	}

	return output.join(", ");
}
