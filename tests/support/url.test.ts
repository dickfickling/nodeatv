import { describe, expect, it } from "vitest";
import { isUrl, isUrlOrScheme } from "../../src/support/url.js";

describe("isUrl", () => {
	it("accepts http URL", () => {
		expect(isUrl("http://example.com")).toBe(true);
	});

	it("accepts app URL", () => {
		expect(
			isUrl(
				"com.apple.tv://tv.apple.com/show/marvels-spidey-and-his-amazing-friends/umc.cmc.3ambs8tqwzphbn0u8e9g76x7m?profile=kids&action=play",
			),
		).toBe(true);
	});

	it("rejects bundle id", () => {
		expect(isUrl("com.apple.tv")).toBe(false);
	});

	it("rejects scheme without host", () => {
		expect(isUrl("com.apple.tv://")).toBe(false);
	});
});

describe("isUrlOrScheme", () => {
	it("accepts http URL", () => {
		expect(isUrlOrScheme("http://example.com")).toBe(true);
	});

	it("accepts app URL", () => {
		expect(
			isUrlOrScheme(
				"com.apple.tv://tv.apple.com/show/marvels-spidey-and-his-amazing-friends/umc.cmc.3ambs8tqwzphbn0u8e9g76x7m?profile=kids&action=play",
			),
		).toBe(true);
	});

	it("rejects bundle id", () => {
		expect(isUrlOrScheme("com.apple.tv")).toBe(false);
	});

	it("accepts scheme without host", () => {
		expect(isUrlOrScheme("com.apple.tv://")).toBe(true);
	});
});
