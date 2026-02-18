import { describe, expect, it } from "vitest";
import { BlockedStateError, InvalidStateError } from "../../src/exceptions.js";
import * as shieldMod from "../../src/support/shield.js";

class Dummy {}

class GuardedClass {
	guardedMethod = shieldMod.guard(function (
		this: GuardedClass,
		a: number,
	): number {
		return a * a;
	}, "guardedMethod");

	unguardedMethod(b: number): number {
		return b + b;
	}
}

describe("shield", () => {
	it("shields an object", () => {
		const obj = new Dummy();
		expect(shieldMod.isShielded(obj)).toBe(false);
		const obj2 = shieldMod.shield(obj);
		expect(obj).toBe(obj2);
		expect(shieldMod.isShielded(obj)).toBe(true);
	});

	it("cannot block unshielded object", () => {
		const obj = new Dummy();
		expect(() => shieldMod.block(obj)).toThrow(InvalidStateError);
	});

	it("isBlocking does not raise on unshielded object", () => {
		const obj = new Dummy();
		expect(shieldMod.isBlocking(obj)).toBe(false);
	});

	it("blocks a shielded object", () => {
		const obj = new Dummy();
		shieldMod.shield(obj);
		expect(shieldMod.isBlocking(obj)).toBe(false);
		shieldMod.block(obj);
		expect(shieldMod.isBlocking(obj)).toBe(true);
	});

	it("guards methods when blocked", () => {
		const obj = new GuardedClass();
		shieldMod.shield(obj);

		expect(obj.guardedMethod(2)).toBe(4);
		expect(obj.unguardedMethod(4)).toBe(8);

		shieldMod.block(obj);

		expect(() => obj.guardedMethod(2)).toThrow(BlockedStateError);
		expect(obj.unguardedMethod(5)).toBe(10);
	});
});
