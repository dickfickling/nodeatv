import { describe, expect, it } from "vitest";
import { readVariant, writeVariant } from "../../../src/support/variant.js";

describe("writeVariant", () => {
	it("encodes single-byte values", () => {
		expect(writeVariant(0)).toEqual(Buffer.from([0x00]));
		expect(writeVariant(1)).toEqual(Buffer.from([0x01]));
		expect(writeVariant(127)).toEqual(Buffer.from([0x7f]));
	});

	it("encodes two-byte values", () => {
		expect(writeVariant(128)).toEqual(Buffer.from([0x80, 0x01]));
		expect(writeVariant(300)).toEqual(Buffer.from([0xac, 0x02]));
	});

	it("encodes larger values", () => {
		// 16384 = 0x4000 -> varint bytes: 0x80, 0x80, 0x01
		expect(writeVariant(16384)).toEqual(Buffer.from([0x80, 0x80, 0x01]));
	});
});

describe("readVariant", () => {
	it("decodes single-byte values", () => {
		const [value, remaining] = readVariant(Buffer.from([0x01, 0xff]));
		expect(value).toBe(1);
		expect(remaining.length).toBe(1);
		expect(remaining[0]).toBe(0xff);
	});

	it("decodes multi-byte values", () => {
		const [value, remaining] = readVariant(Buffer.from([0x80, 0x01]));
		expect(value).toBe(128);
		expect(remaining.length).toBe(0);
	});

	it("decodes zero", () => {
		const [value, remaining] = readVariant(Buffer.from([0x00]));
		expect(value).toBe(0);
		expect(remaining.length).toBe(0);
	});

	it("throws for incomplete varint", () => {
		expect(() => readVariant(Buffer.from([0x80]))).toThrow("invalid variant");
	});

	it("throws for empty buffer", () => {
		expect(() => readVariant(Buffer.alloc(0))).toThrow("invalid variant");
	});

	it("roundtrips values correctly", () => {
		for (const value of [0, 1, 127, 128, 255, 300, 16384, 65535]) {
			const encoded = writeVariant(value);
			const [decoded] = readVariant(encoded);
			expect(decoded).toBe(value);
		}
	});
});

describe("varint framing", () => {
	it("can frame and unframe a message", () => {
		const payload = Buffer.from("hello world");
		const frame = Buffer.concat([writeVariant(payload.length), payload]);

		const [length, remaining] = readVariant(frame);
		expect(length).toBe(payload.length);
		expect(remaining.subarray(0, length).toString()).toBe("hello world");
	});

	it("can handle multiple framed messages", () => {
		const msg1 = Buffer.from("first");
		const msg2 = Buffer.from("second");
		const stream = Buffer.concat([
			writeVariant(msg1.length),
			msg1,
			writeVariant(msg2.length),
			msg2,
		]);

		const [len1, rest1] = readVariant(stream);
		expect(rest1.subarray(0, len1).toString()).toBe("first");

		const [len2, rest2] = readVariant(rest1.subarray(len1));
		expect(rest2.subarray(0, len2).toString()).toBe("second");
	});
});
