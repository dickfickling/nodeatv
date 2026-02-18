import { describe, expect, it } from "vitest";
import { DeviceState, MediaType } from "../../../src/const.js";
import {
	mediaKind,
	msToS,
	playstate,
} from "../../../src/protocols/dmap/daap.js";

describe("mediaKind", () => {
	it("maps unknown kinds", () => {
		expect(mediaKind(1)).toBe(MediaType.Unknown);
		expect(mediaKind(32770)).toBe(MediaType.Unknown);
	});

	it("maps video kinds", () => {
		for (const kind of [3, 7, 11, 12, 13, 18, 32]) {
			expect(mediaKind(kind)).toBe(MediaType.Video);
		}
	});

	it("maps music kinds", () => {
		for (const kind of [2, 4, 10, 14, 17, 21, 36]) {
			expect(mediaKind(kind)).toBe(MediaType.Music);
		}
	});

	it("maps TV kinds", () => {
		expect(mediaKind(8)).toBe(MediaType.TV);
		expect(mediaKind(64)).toBe(MediaType.TV);
	});

	it("throws for unknown kind", () => {
		expect(() => mediaKind(999)).toThrow("Unknown media kind");
	});
});

describe("playstate", () => {
	it("maps idle states", () => {
		expect(playstate(0)).toBe(DeviceState.Idle);
		expect(playstate(null)).toBe(DeviceState.Idle);
		expect(playstate(undefined)).toBe(DeviceState.Idle);
	});

	it("maps known states", () => {
		expect(playstate(1)).toBe(DeviceState.Loading);
		expect(playstate(2)).toBe(DeviceState.Stopped);
		expect(playstate(3)).toBe(DeviceState.Paused);
		expect(playstate(4)).toBe(DeviceState.Playing);
		expect(playstate(5)).toBe(DeviceState.Seeking);
		expect(playstate(6)).toBe(DeviceState.Seeking);
	});

	it("throws for unknown state", () => {
		expect(() => playstate(99)).toThrow("Unknown playstate");
	});
});

describe("msToS", () => {
	it("converts ms to seconds", () => {
		expect(msToS(1000)).toBe(1);
		expect(msToS(1500)).toBe(2);
		expect(msToS(60000)).toBe(60);
	});

	it("returns 0 for null/undefined", () => {
		expect(msToS(null)).toBe(0);
		expect(msToS(undefined)).toBe(0);
	});

	it("returns 0 for max uint32", () => {
		expect(msToS(0xffffffff)).toBe(0);
	});
});
