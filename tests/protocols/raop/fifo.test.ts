import { describe, expect, it } from "vitest";
import { PacketFifo } from "../../../src/protocols/raop/fifo.js";

describe("PacketFifo", () => {
	it("should store and retrieve items", () => {
		const fifo = new PacketFifo<number>(5);
		fifo.set(1, 100);
		fifo.set(2, 200);
		expect(fifo.get(1)).toBe(100);
		expect(fifo.get(2)).toBe(200);
	});

	it("should report correct size", () => {
		const fifo = new PacketFifo<number>(5);
		expect(fifo.size).toBe(0);
		fifo.set(1, 100);
		expect(fifo.size).toBe(1);
		fifo.set(2, 200);
		expect(fifo.size).toBe(2);
	});

	it("should remove oldest when exceeding limit", () => {
		const fifo = new PacketFifo<number>(2);
		fifo.set(1, 100);
		fifo.set(2, 200);
		fifo.set(3, 300);
		expect(fifo.size).toBe(2);
		expect(fifo.has(1)).toBe(false);
		expect(fifo.get(2)).toBe(200);
		expect(fifo.get(3)).toBe(300);
	});

	it("should throw when adding duplicate index", () => {
		const fifo = new PacketFifo<number>(5);
		fifo.set(1, 100);
		expect(() => fifo.set(1, 200)).toThrow("1 already in FIFO");
	});

	it("should throw on non-integer key for set", () => {
		const fifo = new PacketFifo<number>(5);
		expect(() => fifo.set(1.5, 100)).toThrow("only integer supported");
	});

	it("should throw on non-integer key for get", () => {
		const fifo = new PacketFifo<number>(5);
		expect(() => fifo.get(1.5)).toThrow("only integer supported");
	});

	it("should return undefined for missing keys", () => {
		const fifo = new PacketFifo<number>(5);
		expect(fifo.get(42)).toBeUndefined();
	});

	it("should report has correctly", () => {
		const fifo = new PacketFifo<number>(5);
		expect(fifo.has(1)).toBe(false);
		fifo.set(1, 100);
		expect(fifo.has(1)).toBe(true);
	});

	it("should clear all items", () => {
		const fifo = new PacketFifo<number>(5);
		fifo.set(1, 100);
		fifo.set(2, 200);
		fifo.clear();
		expect(fifo.size).toBe(0);
		expect(fifo.has(1)).toBe(false);
	});

	it("should iterate over keys", () => {
		const fifo = new PacketFifo<number>(5);
		fifo.set(10, 100);
		fifo.set(20, 200);
		fifo.set(30, 300);
		const keys = [...fifo.keys()];
		expect(keys).toEqual([10, 20, 30]);
	});

	it("should return string representation", () => {
		const fifo = new PacketFifo<number>(5);
		fifo.set(1, 100);
		fifo.set(2, 200);
		expect(fifo.toString()).toBe("[1,2]");
	});

	it("should handle single-element limit", () => {
		const fifo = new PacketFifo<string>(1);
		fifo.set(1, "a");
		expect(fifo.size).toBe(1);
		fifo.set(2, "b");
		expect(fifo.size).toBe(1);
		expect(fifo.has(1)).toBe(false);
		expect(fifo.get(2)).toBe("b");
	});

	it("should work with Buffer values", () => {
		const fifo = new PacketFifo<Buffer>(5);
		const buf = Buffer.from([1, 2, 3]);
		fifo.set(0, buf);
		expect(fifo.get(0)).toBe(buf);
	});
});
