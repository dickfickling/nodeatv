import { describe, expect, it } from "vitest";
import {
	BUFFER_SIZE,
	HEADROOM_SIZE,
	SemiSeekableBuffer,
} from "../../src/support/buffer.js";

describe("SemiSeekableBuffer", () => {
	it("has correct default sizes", () => {
		expect(BUFFER_SIZE).toBe(8192);
		expect(HEADROOM_SIZE).toBe(1024);
	});

	it("is initially empty", () => {
		const buf = new SemiSeekableBuffer();
		expect(buf.empty()).toBe(true);
		expect(buf.size).toBe(0);
		expect(buf.position).toBe(0);
		expect(buf.length).toBe(0);
	});

	it("throws when headroom exceeds buffer size", () => {
		expect(() => new SemiSeekableBuffer(100, 200)).toThrow(
			"too large seekable headroom",
		);
	});

	it("add data increases size", () => {
		const buf = new SemiSeekableBuffer(100, 10);
		const data = Buffer.alloc(50, 0xab);
		const added = buf.add(data);
		expect(added).toBe(50);
		expect(buf.size).toBe(50);
		expect(buf.empty()).toBe(false);
	});

	it("add respects buffer size limit", () => {
		const buf = new SemiSeekableBuffer(10, 5);
		const data = Buffer.alloc(20, 0xab);
		const added = buf.add(data);
		expect(added).toBe(10);
		expect(buf.size).toBe(10);
	});

	it("get returns data and updates position", () => {
		const buf = new SemiSeekableBuffer(100, 10);
		buf.add(Buffer.from([1, 2, 3, 4, 5]));
		const data = buf.get(3);
		expect([...data]).toEqual([1, 2, 3]);
		expect(buf.position).toBe(3);
	});

	it("get from empty buffer returns empty", () => {
		const buf = new SemiSeekableBuffer(100, 10);
		const data = buf.get(5);
		expect(data.length).toBe(0);
	});

	it("remaining reflects available space", () => {
		const buf = new SemiSeekableBuffer(100, 10);
		expect(buf.remaining).toBe(100);
		buf.add(Buffer.alloc(30));
		expect(buf.remaining).toBe(70);
	});

	it("seek to current position always works", () => {
		const buf = new SemiSeekableBuffer(100, 10);
		expect(buf.seek(0)).toBe(true);
	});

	it("seek within headroom works", () => {
		const buf = new SemiSeekableBuffer(100, 10);
		buf.add(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
		buf.get(5);
		expect(buf.position).toBe(5);
		expect(buf.seek(0)).toBe(true);
		expect(buf.position).toBe(0);
	});

	it("seek beyond headroom fails", () => {
		const buf = new SemiSeekableBuffer(100, 5);
		buf.add(Buffer.alloc(20));
		expect(buf.seek(5)).toBe(false);
	});

	it("seek after headroom consumed fails", () => {
		const buf = new SemiSeekableBuffer(100, 5);
		buf.add(Buffer.alloc(20));
		buf.get(10); // reads past headroom
		expect(buf.seek(0)).toBe(false);
	});

	it("headroom data is kept until read past", () => {
		const buf = new SemiSeekableBuffer(100, 5);
		buf.add(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));

		// Read first 3 bytes, still within headroom
		buf.get(3);
		expect(buf.seek(0)).toBe(true);

		// Read the data again
		const data = buf.get(3);
		expect([...data]).toEqual([1, 2, 3]);
	});

	it("reading past headroom discards it", () => {
		const buf = new SemiSeekableBuffer(100, 5);
		buf.add(Buffer.alloc(20));

		// Read past headroom
		buf.get(6);
		expect(buf.seek(0)).toBe(false);
	});

	it("fits checks if data can be added", () => {
		const buf = new SemiSeekableBuffer(10, 5);
		expect(buf.fits(10)).toBe(true);
		expect(buf.fits(11)).toBe(false);
		expect(buf.fits(Buffer.alloc(10))).toBe(true);
		expect(buf.fits(Buffer.alloc(11))).toBe(false);
	});

	it("fits after partial fill", () => {
		const buf = new SemiSeekableBuffer(10, 5);
		buf.add(Buffer.alloc(5));
		expect(buf.fits(5)).toBe(true);
		expect(buf.fits(6)).toBe(false);
	});

	it("protected headroom preserves all data", () => {
		const buf = new SemiSeekableBuffer(100, 10, true);
		expect(buf.protectedHeadroom).toBe(true);

		buf.add(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));

		// Read all data
		buf.get(10);
		expect(buf.position).toBe(10);

		// Can still seek back to beginning
		expect(buf.seek(0)).toBe(true);

		// Data is still there
		const data = buf.get(5);
		expect([...data]).toEqual([1, 2, 3, 4, 5]);
	});

	it("cannot enable protected headroom after reading", () => {
		const buf = new SemiSeekableBuffer(100, 10);
		buf.add(Buffer.alloc(10));
		buf.get(1);
		expect(() => {
			buf.protectedHeadroom = true;
		}).toThrow("not a starting position");
	});

	it("cannot disable protected headroom at non-zero position", () => {
		const buf = new SemiSeekableBuffer(100, 10, true);
		buf.add(Buffer.alloc(10));
		buf.get(5);
		expect(() => {
			buf.protectedHeadroom = false;
		}).toThrow("not a starting position");
	});

	it("setting same protected value does nothing", () => {
		const buf = new SemiSeekableBuffer(100, 10, true);
		buf.protectedHeadroom = true; // same value, should not throw
		expect(buf.protectedHeadroom).toBe(true);
	});

	it("seek to position beyond available data fails", () => {
		const buf = new SemiSeekableBuffer(100, 10);
		buf.add(Buffer.from([1, 2, 3]));
		expect(buf.seek(5)).toBe(false);
	});

	it("multiple add and get cycles", () => {
		const buf = new SemiSeekableBuffer(20, 5);
		buf.add(Buffer.from([1, 2, 3, 4, 5]));
		buf.get(5); // reads past headroom, discards
		buf.add(Buffer.from([6, 7, 8, 9, 10]));
		const data = buf.get(5);
		expect([...data]).toEqual([6, 7, 8, 9, 10]);
	});

	it("get more bytes than available returns what is there", () => {
		const buf = new SemiSeekableBuffer(100, 10);
		buf.add(Buffer.from([1, 2, 3]));
		const data = buf.get(10);
		expect(data.length).toBe(3);
		expect([...data]).toEqual([1, 2, 3]);
	});

	it("reading without headroom data", () => {
		const buf = new SemiSeekableBuffer(100, 5);
		buf.add(Buffer.alloc(10));

		// Read past headroom to discard it
		buf.get(6);

		// Now reading without headroom
		const data = buf.get(4);
		expect(data.length).toBe(4);
	});
});
