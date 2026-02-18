import { describe, expect, it } from "vitest";
import {
	CaseInsensitiveDict,
	dictMerge,
	dictSubtract,
	SharedData,
} from "../../src/support/collections.js";

describe("dictMerge", () => {
	it("merges non-overlapping keys", () => {
		const a = new Map([["a", 1]]);
		const b = new Map([["b", 2]]);
		const result = dictMerge(a, b);
		expect(result.get("a")).toBe(1);
		expect(result.get("b")).toBe(2);
	});

	it("does not overwrite by default", () => {
		const a = new Map([["a", 1]]);
		const b = new Map([["a", 2]]);
		const result = dictMerge(a, b);
		expect(result.get("a")).toBe(1);
	});

	it("overwrites when allowed", () => {
		const a = new Map([["a", 1]]);
		const b = new Map([["a", 2]]);
		const result = dictMerge(a, b, true);
		expect(result.get("a")).toBe(2);
	});

	it("mutates the first map", () => {
		const a = new Map<string, number>();
		const b = new Map([["a", 1]]);
		dictMerge(a, b);
		expect(a.get("a")).toBe(1);
	});
});

describe("dictSubtract", () => {
	it("removes keys present in second dict", () => {
		const a = { a: 1, b: 2, c: 3 };
		const b = { a: 10, b: 20 };
		const result = dictSubtract(a, b);
		expect(result).toEqual({ c: 3 });
	});

	it("keeps all keys when second dict is empty", () => {
		const a = { a: 1, b: 2 };
		const b = {};
		const result = dictSubtract(a, b);
		expect(result).toEqual({ a: 1, b: 2 });
	});

	it("removes only matching values when removeIfSameValue", () => {
		const a = { a: 1, b: 2 };
		const b = { a: 1, b: 3 };
		const result = dictSubtract(a, b, true);
		expect(result).toEqual({ b: 2 });
	});

	it("handles nested dicts recursively", () => {
		const a = { nested: { a: 1, b: 2 } };
		const b = { nested: { a: 10 } };
		const result = dictSubtract(a, b);
		expect(result).toEqual({ nested: { b: 2 } });
	});
});

describe("CaseInsensitiveDict", () => {
	it("get and set are case-insensitive", () => {
		const dict = new CaseInsensitiveDict<number>();
		dict.set("Hello", 1);
		expect(dict.get("hello")).toBe(1);
		expect(dict.get("HELLO")).toBe(1);
		expect(dict.get("Hello")).toBe(1);
	});

	it("has is case-insensitive", () => {
		const dict = new CaseInsensitiveDict<number>();
		dict.set("Key", 1);
		expect(dict.has("key")).toBe(true);
		expect(dict.has("KEY")).toBe(true);
		expect(dict.has("missing")).toBe(false);
	});

	it("delete is case-insensitive", () => {
		const dict = new CaseInsensitiveDict<number>();
		dict.set("Key", 1);
		dict.delete("KEY");
		expect(dict.has("key")).toBe(false);
		expect(dict.size).toBe(0);
	});

	it("size reflects entries", () => {
		const dict = new CaseInsensitiveDict<number>();
		expect(dict.size).toBe(0);
		dict.set("a", 1);
		expect(dict.size).toBe(1);
		dict.set("A", 2); // same key
		expect(dict.size).toBe(1);
		dict.set("b", 3);
		expect(dict.size).toBe(2);
	});

	it("constructs from Map", () => {
		const map = new Map([
			["Hello", 1],
			["World", 2],
		]);
		const dict = new CaseInsensitiveDict<number>(map);
		expect(dict.get("hello")).toBe(1);
		expect(dict.get("WORLD")).toBe(2);
	});

	it("constructs from Record", () => {
		const dict = new CaseInsensitiveDict<number>({ Hello: 1, World: 2 });
		expect(dict.get("hello")).toBe(1);
		expect(dict.get("WORLD")).toBe(2);
	});

	it("constructs from iterable of tuples", () => {
		const entries: [string, number][] = [
			["Hello", 1],
			["World", 2],
		];
		const dict = new CaseInsensitiveDict<number>(entries);
		expect(dict.get("hello")).toBe(1);
		expect(dict.get("WORLD")).toBe(2);
	});

	it("iterates keys", () => {
		const dict = new CaseInsensitiveDict<number>();
		dict.set("Hello", 1);
		dict.set("World", 2);
		const keys = [...dict.keys()];
		expect(keys).toEqual(["hello", "world"]);
	});

	it("iterates values", () => {
		const dict = new CaseInsensitiveDict<number>();
		dict.set("Hello", 1);
		dict.set("World", 2);
		const values = [...dict.values()];
		expect(values).toEqual([1, 2]);
	});

	it("iterates entries", () => {
		const dict = new CaseInsensitiveDict<number>();
		dict.set("Hello", 1);
		const entries = [...dict.entries()];
		expect(entries).toEqual([["hello", 1]]);
	});

	it("equals another CaseInsensitiveDict", () => {
		const a = new CaseInsensitiveDict<number>();
		a.set("Key", 1);
		const b = new CaseInsensitiveDict<number>();
		b.set("key", 1);
		expect(a.equals(b)).toBe(true);
	});

	it("not equals when different values", () => {
		const a = new CaseInsensitiveDict<number>();
		a.set("Key", 1);
		const b = new CaseInsensitiveDict<number>();
		b.set("key", 2);
		expect(a.equals(b)).toBe(false);
	});

	it("equals a Map with case differences", () => {
		const dict = new CaseInsensitiveDict<number>();
		dict.set("key", 1);
		const map = new Map([["KEY", 1]]);
		expect(dict.equals(map)).toBe(true);
	});

	it("toString", () => {
		const dict = new CaseInsensitiveDict<number>();
		dict.set("A", 1);
		expect(dict.toString()).toContain("a: 1");
	});
});

describe("SharedData", () => {
	it("resolves when set is called", async () => {
		const shared = new SharedData<string>();
		setTimeout(() => shared.set("hello"), 10);
		const result = await shared.wait();
		expect(result).toBe("hello");
	});

	it("resolves immediately if already set", async () => {
		const shared = new SharedData<string>();
		shared.set("hello");
		const result = await shared.wait();
		expect(result).toBe("hello");
	});

	it("times out when not set", async () => {
		const shared = new SharedData<string>();
		await expect(shared.wait(50)).rejects.toThrow("timed out");
	});
});
