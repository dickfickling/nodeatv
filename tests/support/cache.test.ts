import { describe, expect, it } from "vitest";
import { Cache } from "../../src/support/cache.js";

describe("Cache", () => {
	it("is initially empty", () => {
		const cache = new Cache<string>();
		expect(cache.empty()).toBe(true);
		expect(cache.size).toBe(0);
		expect(cache.latest()).toBeNull();
	});

	it("put and get", () => {
		const cache = new Cache<string>();
		cache.put("a", "value_a");
		expect(cache.empty()).toBe(false);
		expect(cache.size).toBe(1);
		expect(cache.get("a")).toBe("value_a");
	});

	it("has", () => {
		const cache = new Cache<string>();
		expect(cache.has("a")).toBe(false);
		cache.put("a", "value_a");
		expect(cache.has("a")).toBe(true);
	});

	it("get missing key throws", () => {
		const cache = new Cache<string>();
		expect(() => cache.get("missing")).toThrow();
	});

	it("latest returns most recent key", () => {
		const cache = new Cache<string>();
		cache.put("a", "1");
		cache.put("b", "2");
		expect(cache.latest()).toBe("b");
	});

	it("get moves item to end", () => {
		const cache = new Cache<string>();
		cache.put("a", "1");
		cache.put("b", "2");
		cache.get("a");
		expect(cache.latest()).toBe("a");
	});

	it("put existing key updates value and moves to end", () => {
		const cache = new Cache<string>();
		cache.put("a", "1");
		cache.put("b", "2");
		cache.put("a", "3");
		expect(cache.get("a")).toBe("3");
		expect(cache.latest()).toBe("a");
	});

	it("evicts oldest when limit reached", () => {
		const cache = new Cache<string>(2);
		cache.put("a", "1");
		cache.put("b", "2");
		cache.put("c", "3");
		expect(cache.has("a")).toBe(false);
		expect(cache.has("b")).toBe(true);
		expect(cache.has("c")).toBe(true);
		expect(cache.size).toBe(2);
	});

	it("evicts correct item after access", () => {
		const cache = new Cache<string>(2);
		cache.put("a", "1");
		cache.put("b", "2");
		cache.get("a"); // moves a to end
		cache.put("c", "3"); // should evict b
		expect(cache.has("a")).toBe(true);
		expect(cache.has("b")).toBe(false);
		expect(cache.has("c")).toBe(true);
	});

	it("default limit is 16", () => {
		const cache = new Cache<string>();
		expect(cache.limit).toBe(16);
	});

	it("custom limit", () => {
		const cache = new Cache<string>(5);
		expect(cache.limit).toBe(5);
	});
});
