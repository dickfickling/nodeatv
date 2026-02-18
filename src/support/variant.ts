export function readVariant(data: Buffer): [number, Buffer] {
	let result = 0;
	for (let i = 0; i < data.length; i++) {
		result |= (data[i] & 0x7f) << (7 * i);
		if (!(data[i] & 0x80)) {
			return [result, data.subarray(i + 1)];
		}
	}
	throw new Error("invalid variant");
}

export function writeVariant(value: number): Buffer {
	if (value < 128) {
		return Buffer.from([value]);
	}
	return Buffer.concat([
		Buffer.from([(value & 0x7f) | 0x80]),
		writeVariant(value >> 7),
	]);
}
