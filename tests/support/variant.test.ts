import { describe, expect, it } from "vitest";
import { readVariant, writeVariant } from "../../src/support/variant.js";

describe("readVariant", () => {
	it("reads single byte values", () => {
		expect(readVariant(Buffer.from([0x00]))[0]).toBe(0x00);
		expect(readVariant(Buffer.from([0x35]))[0]).toBe(0x35);
	});

	it("reads multiple byte values", () => {
		expect(readVariant(Buffer.from([0xb5, 0x44]))[0]).toBe(8757);
		expect(readVariant(Buffer.from([0xc5, 0x92, 0x01]))[0]).toBe(18757);
	});

	it("returns remaining data", () => {
		const [value, remaining] = readVariant(
			Buffer.from([0xb5, 0x44, 0xca, 0xfe]),
		);
		expect(value).toBe(8757);
		expect(remaining).toEqual(Buffer.from([0xca, 0xfe]));
	});

	it("throws on invalid variant", () => {
		expect(() => readVariant(Buffer.from([0x80]))).toThrow();
	});
});

describe("writeVariant", () => {
	it("writes single byte values", () => {
		expect(writeVariant(0x00)).toEqual(Buffer.from([0x00]));
		expect(writeVariant(0x35)).toEqual(Buffer.from([0x35]));
	});

	it("writes multiple byte values", () => {
		expect(writeVariant(8757)).toEqual(Buffer.from([0xb5, 0x44]));
		expect(writeVariant(18757)).toEqual(Buffer.from([0xc5, 0x92, 0x01]));
	});
});
