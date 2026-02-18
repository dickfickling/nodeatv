import { describe, expect, it } from "vitest";
import {
	errorHandler,
	mapRange,
	shiftHexIdentifier,
} from "../../src/support/utils.js";

class DummyException extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "DummyException";
	}
}

describe("errorHandler", () => {
	it("returns function return value", async () => {
		const result = await errorHandler(async () => 123, DummyException);
		expect(result).toBe(123);
	});

	it("wraps generic exceptions with fallback", async () => {
		await expect(
			errorHandler(async () => {
				throw new Error("test");
			}, DummyException),
		).rejects.toThrow(DummyException);
	});
});

describe("mapRange", () => {
	it("maps value correctly", () => {
		expect(mapRange(1.0, 0.0, 25.0, 0.0, 100.0)).toBeCloseTo(4.0);
	});

	it.each([
		[0.0, 0.0, 0.0, 1.0],
		[1.0, 0.0, 0.0, 1.0],
		[0.0, 1.0, 0.0, 0.0],
		[0.0, 1.0, 1.0, 0.0],
	])("throws on bad ranges (%s, %s, %s, %s)", (inMin, inMax, outMin, outMax) => {
		expect(() => mapRange(1, inMin, inMax, outMin, outMax)).toThrow();
	});

	it.each([-1.0, 11.0])("throws on out-of-range input %s", (value) => {
		expect(() => mapRange(value, 0.0, 10.0, 20.0, 30.0)).toThrow();
	});
});

describe("shiftHexIdentifier", () => {
	it.each([
		["00:11:22:33:44:55", "01:11:22:33:44:55"],
		["01:11:22:33:44:55", "02:11:22:33:44:55"],
		["FF:11:22:33:44:55", "00:11:22:33:44:55"],
		[
			"00000000-1111-2222-3333-444444444444",
			"01000000-1111-2222-3333-444444444444",
		],
		[
			"01000000-1111-2222-3333-444444444444",
			"02000000-1111-2222-3333-444444444444",
		],
		[
			"FF000000-1111-2222-3333-444444444444",
			"00000000-1111-2222-3333-444444444444",
		],
		[
			"00000000-1111-2222-3333-444444444444+55555555-6666-7777-8888-999999999999",
			"01000000-1111-2222-3333-444444444444+55555555-6666-7777-8888-999999999999",
		],
		[
			"01000000-1111-2222-3333-444444444444+55555555-6666-7777-8888-999999999999",
			"02000000-1111-2222-3333-444444444444+55555555-6666-7777-8888-999999999999",
		],
		[
			"FF000000-1111-2222-3333-444444444444+55555555-6666-7777-8888-999999999999",
			"00000000-1111-2222-3333-444444444444+55555555-6666-7777-8888-999999999999",
		],
	])("shifts %s to %s", (input, output) => {
		expect(shiftHexIdentifier(input)).toBe(output);
	});

	it.each(["", "a"])("throws on too-short input %s", (input) => {
		expect(() => shiftHexIdentifier(input)).toThrow();
	});
});
