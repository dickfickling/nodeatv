import { describe, expect, it } from "vitest";
import { defpacket } from "../../src/support/packet.js";

const Foo = defpacket("Foo", { a: "c", b: "H" });
const Bar = Foo.extend("Bar", { c: "I" });

describe("defpacket", () => {
	it("encodes messages", () => {
		expect(Foo.encode(Buffer.from([0x16]), 0x123)).toEqual(
			Buffer.from([0x16, 0x01, 0x23]),
		);
	});

	it("decodes message", () => {
		const decoded = Foo.decode(Buffer.from([0x16, 0x01, 0x23]));
		expect(decoded.a).toEqual(Buffer.from([0x16]));
		expect(decoded.b).toBe(0x123);
	});

	it("decodes with excessive data", () => {
		const decoded = Foo.decode(
			Buffer.from([0x17, 0x02, 0x34, 0x11, 0x22, 0x33]),
			true,
		);
		expect(decoded.a).toEqual(Buffer.from([0x17]));
		expect(decoded.b).toBe(0x234);
	});

	it("extends and encodes", () => {
		expect(Bar.encode(Buffer.from([0x77]), 0x67, 0xaabbccdd)).toEqual(
			Buffer.from([0x77, 0x00, 0x67, 0xaa, 0xbb, 0xcc, 0xdd]),
		);
	});

	it("extends and decodes", () => {
		const decoded = Bar.decode(
			Buffer.from([0x77, 0x00, 0x67, 0xaa, 0xbb, 0xcc, 0xdd]),
		);
		expect(decoded.a).toEqual(Buffer.from([0x77]));
		expect(decoded.b).toBe(0x0067);
		expect(decoded.c).toBe(0xaabbccdd);
	});

	it("has correct length", () => {
		expect(Foo.length).toBe(3);
		expect(Bar.length).toBe(3 + 4);
	});
});
