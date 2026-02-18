import { describe, expect, it } from "vitest";
import {
	boolTag,
	containerTag,
	rawTag,
	readBool,
	readBytes,
	readIgnore,
	readStr,
	readUint,
	stringTag,
	uint8Tag,
	uint16Tag,
	uint32Tag,
	uint64Tag,
} from "../../../src/protocols/dmap/tags.js";

describe("tag reading", () => {
	it("readStr extracts string", () => {
		const buf = Buffer.from("hello world", "utf-8");
		expect(readStr(buf, 0, 5)).toBe("hello");
		expect(readStr(buf, 6, 5)).toBe("world");
	});

	it("readUint extracts uint values", () => {
		const buf = Buffer.from([0x00, 0x00, 0x00, 0x2a]);
		expect(readUint(buf, 0, 4)).toBe(42);
		expect(readUint(buf, 0, 1)).toBe(0);
		expect(readUint(buf, 3, 1)).toBe(42);
	});

	it("readUint returns 0 for length 0", () => {
		expect(readUint(Buffer.alloc(0), 0, 0)).toBe(0);
	});

	it("readBool extracts boolean", () => {
		const buf = Buffer.from([0x00, 0x00, 0x00, 0x01]);
		expect(readBool(buf, 0, 4)).toBe(true);
		const buf2 = Buffer.from([0x00, 0x00, 0x00, 0x00]);
		expect(readBool(buf2, 0, 4)).toBe(false);
	});

	it("readBytes returns hex string", () => {
		const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
		expect(readBytes(buf, 0, 4)).toBe("0xdeadbeef");
	});

	it("readIgnore returns undefined", () => {
		expect(readIgnore(Buffer.alloc(10), 0, 10)).toBeUndefined();
	});
});

describe("tag creation", () => {
	it("uint8Tag creates correct buffer", () => {
		const result = uint8Tag("test", 42);
		expect(result.length).toBe(9);
		expect(result.subarray(0, 4).toString("utf-8")).toBe("test");
		expect(result.readUInt32BE(4)).toBe(1);
		expect(result.readUInt8(8)).toBe(42);
	});

	it("uint16Tag creates correct buffer", () => {
		const result = uint16Tag("test", 1000);
		expect(result.length).toBe(10);
		expect(result.readUInt32BE(4)).toBe(2);
		expect(result.readUInt16BE(8)).toBe(1000);
	});

	it("uint32Tag creates correct buffer", () => {
		const result = uint32Tag("test", 100000);
		expect(result.length).toBe(12);
		expect(result.readUInt32BE(4)).toBe(4);
		expect(result.readUInt32BE(8)).toBe(100000);
	});

	it("uint64Tag creates correct buffer", () => {
		const result = uint64Tag("test", 0x123456789abcn);
		expect(result.length).toBe(16);
		expect(result.readUInt32BE(4)).toBe(8);
		expect(result.readBigUInt64BE(8)).toBe(0x123456789abcn);
	});

	it("boolTag creates correct buffer", () => {
		const trueTag = boolTag("test", true);
		expect(trueTag.readUInt8(8)).toBe(1);
		const falseTag = boolTag("test", false);
		expect(falseTag.readUInt8(8)).toBe(0);
	});

	it("stringTag creates correct buffer", () => {
		const result = stringTag("test", "hello");
		expect(result.subarray(0, 4).toString("utf-8")).toBe("test");
		expect(result.readUInt32BE(4)).toBe(5);
		expect(result.subarray(8).toString("utf-8")).toBe("hello");
	});

	it("rawTag creates correct buffer", () => {
		const data = Buffer.from([1, 2, 3]);
		const result = rawTag("test", data);
		expect(result.readUInt32BE(4)).toBe(3);
		expect(result.subarray(8)).toEqual(data);
	});

	it("containerTag wraps data", () => {
		const inner = uint8Tag("innr", 1);
		const result = containerTag("outr", inner);
		expect(result.subarray(0, 4).toString("utf-8")).toBe("outr");
		expect(result.readUInt32BE(4)).toBe(inner.length);
		expect(result.subarray(8)).toEqual(inner);
	});
});
