import { describe, expect, it } from "vitest";
import {
	DeviceState,
	MediaType,
	RepeatState,
	ShuffleState,
} from "../../../src/const.js";
import {
	buildPlayingInstance,
	scan,
} from "../../../src/protocols/dmap/index.js";
import { parse } from "../../../src/protocols/dmap/parser.js";
import { lookupTag } from "../../../src/protocols/dmap/tagDefinitions.js";
import {
	containerTag,
	stringTag,
	uint32Tag,
} from "../../../src/protocols/dmap/tags.js";

function buildPlaystatus(
	options: {
		caps?: number;
		cmmk?: number;
		cann?: string;
		cana?: string;
		canl?: string;
		cang?: string;
		cast?: number;
		cant?: number;
		cash?: number;
		carp?: number;
	} = {},
): unknown {
	const parts: Buffer[] = [];
	if (options.caps !== undefined) parts.push(uint32Tag("caps", options.caps));
	if (options.cmmk !== undefined) parts.push(uint32Tag("cmmk", options.cmmk));
	if (options.cann !== undefined) parts.push(stringTag("cann", options.cann));
	if (options.cana !== undefined) parts.push(stringTag("cana", options.cana));
	if (options.canl !== undefined) parts.push(stringTag("canl", options.canl));
	if (options.cang !== undefined) parts.push(stringTag("cang", options.cang));
	if (options.cast !== undefined) parts.push(uint32Tag("cast", options.cast));
	if (options.cant !== undefined) parts.push(uint32Tag("cant", options.cant));
	if (options.cash !== undefined) parts.push(uint32Tag("cash", options.cash));
	if (options.carp !== undefined) parts.push(uint32Tag("carp", options.carp));

	const inner = Buffer.concat(parts);
	return parse(containerTag("cmst", inner), lookupTag);
}

describe("buildPlayingInstance", () => {
	it("returns idle state for empty playstatus", () => {
		const ps = buildPlaystatus();
		const playing = buildPlayingInstance(ps);
		expect(playing.deviceState).toBe(DeviceState.Idle);
		expect(playing.mediaType).toBe(MediaType.Unknown);
	});

	it("returns playing state with metadata", () => {
		const ps = buildPlaystatus({
			caps: 4,
			cmmk: 2,
			cann: "My Song",
			cana: "Artist",
			canl: "Album",
			cang: "Rock",
			cast: 180000,
			cant: 60000,
		});
		const playing = buildPlayingInstance(ps);
		expect(playing.deviceState).toBe(DeviceState.Playing);
		expect(playing.mediaType).toBe(MediaType.Music);
		expect(playing.title).toBe("My Song");
		expect(playing.artist).toBe("Artist");
		expect(playing.album).toBe("Album");
		expect(playing.genre).toBe("Rock");
		expect(playing.totalTime).toBe(180);
		expect(playing.position).toBe(120);
	});

	it("detects video when no artist/album", () => {
		const ps = buildPlaystatus({ caps: 4 });
		const playing = buildPlayingInstance(ps);
		expect(playing.mediaType).toBe(MediaType.Video);
	});

	it("detects music when artist present", () => {
		const ps = buildPlaystatus({ caps: 4, cana: "Artist" });
		const playing = buildPlayingInstance(ps);
		expect(playing.mediaType).toBe(MediaType.Music);
	});

	it("handles shuffle states", () => {
		const psOff = buildPlaystatus({ cash: 0 });
		expect(buildPlayingInstance(psOff).shuffle).toBe(ShuffleState.Off);

		const psOn = buildPlaystatus({ cash: 1 });
		expect(buildPlayingInstance(psOn).shuffle).toBe(ShuffleState.Songs);
	});

	it("handles repeat states", () => {
		const psOff = buildPlaystatus({ carp: 0 });
		expect(buildPlayingInstance(psOff).repeat).toBe(RepeatState.Off);

		const psAll = buildPlaystatus({ carp: 2 });
		expect(buildPlayingInstance(psAll).repeat).toBe(RepeatState.All);
	});
});

describe("scan", () => {
	it("returns handlers for all DMAP service types", () => {
		const handlers = scan();
		expect(handlers).toHaveProperty("_appletv-v2._tcp.local");
		expect(handlers).toHaveProperty("_touch-able._tcp.local");
		expect(handlers).toHaveProperty("_hscp._tcp.local");
	});
});
