import { describe, expect, it } from "vitest";
import type { MediaMetadata } from "../../src/interface.js";
import { EMPTY_METADATA, mergeInto } from "../../src/support/metadata.js";

describe("mergeInto", () => {
	it("returns base instance", () => {
		const base: MediaMetadata = {
			title: null,
			artist: null,
			album: null,
			duration: null,
		};
		const newMeta: MediaMetadata = {
			title: null,
			artist: null,
			album: null,
			duration: null,
		};
		const merged = mergeInto(base, newMeta);
		expect(merged).toBe(base);
	});

	it("fills null fields from new metadata", () => {
		const base: MediaMetadata = {
			title: null,
			artist: null,
			album: null,
			duration: null,
		};
		const newMeta: MediaMetadata = {
			title: "title",
			artist: "artist",
			album: "album",
			duration: 100,
		};
		const merged = mergeInto(base, newMeta);
		expect(merged.title).toBe("title");
		expect(merged.artist).toBe("artist");
		expect(merged.album).toBe("album");
		expect(merged.duration).toBe(100);
	});

	it("does not override set values", () => {
		const base: MediaMetadata = {
			title: "original",
			artist: null,
			album: null,
			duration: null,
		};
		const newMeta: MediaMetadata = {
			title: "new title",
			artist: "artist",
			album: null,
			duration: null,
		};
		const merged = mergeInto(base, newMeta);
		expect(merged.title).toBe("original");
		expect(merged.artist).toBe("artist");
	});

	it("EMPTY_METADATA has all null fields", () => {
		expect(EMPTY_METADATA.title).toBeNull();
		expect(EMPTY_METADATA.artist).toBeNull();
		expect(EMPTY_METADATA.album).toBeNull();
		expect(EMPTY_METADATA.duration).toBeNull();
	});
});
