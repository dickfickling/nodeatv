import { describe, expect, it } from "vitest";
import {
	DeviceModel,
	DeviceState,
	FeatureName,
	FeatureState,
	MediaType,
	OperatingSystem,
	RepeatState,
	ShuffleState,
} from "../src/const.js";
import { deviceStateStr, mediaTypeStr } from "../src/convert.js";
import {
	App,
	DeviceInfo,
	type FeatureInfo,
	Features,
	Playing,
	UserAccount,
} from "../src/interface.js";

// Contains two valid values for each property that are tested against each other
const eqTestCases: [string, unknown, unknown][] = [
	["mediaType", MediaType.Video, MediaType.Music],
	["deviceState", DeviceState.Idle, DeviceState.Playing],
	["title", "foo", "bar"],
	["artist", "abra", "kadabra"],
	["album", "banana", "apple"],
	["genre", "cat", "mouse"],
	["totalTime", 210, 2000],
	["position", 555, 888],
	["shuffle", ShuffleState.Albums, ShuffleState.Songs],
	["repeat", RepeatState.Track, RepeatState.All],
	["hash", "hash1", "hash2"],
	["seriesName", "show1", "show2"],
	["seasonNumber", 1, 20],
	["episodeNumber", 13, 24],
	["contentIdentifier", "abc", "def"],
];

class FeaturesDummy extends Features {
	private featureMap: Map<FeatureName, FeatureState>;

	constructor(featureMap: Map<FeatureName, FeatureState>) {
		super();
		this.featureMap = featureMap;
	}

	getFeature(feature: FeatureName): FeatureInfo {
		const state = this.featureMap.get(feature) ?? FeatureState.Unsupported;
		return { state };
	}
}

// PLAYING

describe("Playing", () => {
	it("shows media type and play state", () => {
		const out = new Playing({
			mediaType: MediaType.Video,
			deviceState: DeviceState.Playing,
		}).toString();
		expect(out).toContain(mediaTypeStr(MediaType.Video));
		expect(out).toContain(deviceStateStr(DeviceState.Playing));
	});

	it("shows basic fields", () => {
		const out = new Playing({
			title: "mytitle",
			artist: "myartist",
			album: "myalbum",
			genre: "mygenre",
			seriesName: "myseries",
			seasonNumber: 1245,
			episodeNumber: 2468,
			contentIdentifier: "content_id",
			itunesStoreIdentifier: 123456789,
		}).toString();
		expect(out).toContain("mytitle");
		expect(out).toContain("myartist");
		expect(out).toContain("myalbum");
		expect(out).toContain("mygenre");
		expect(out).toContain("myseries");
		expect(out).toContain("1245");
		expect(out).toContain("2468");
		expect(out).toContain("content_id");
		expect(out).toContain("123456789");
	});

	it.each([
		[null, 10, null],
		[5, null, 5],
		[-1, null, 0],
		[-1, 10, 0],
		[5, 10, 5],
		[11, 10, 10],
	] as [
		number | null,
		number | null,
		number | null,
	][])("position %s with totalTime %s should be %s", (position, totalTime, expected) => {
		const playing = new Playing({
			position: position ?? undefined,
			totalTime: totalTime ?? undefined,
		});
		expect(playing.position).toBe(expected);
	});

	it("shows only position", () => {
		expect(new Playing({ position: 1234 }).toString()).toContain("1234");
	});

	it("shows only total time", () => {
		expect(new Playing({ totalTime: 5678 }).toString()).toContain("5678");
	});

	it("shows both position and total time", () => {
		const out = new Playing({
			position: 1234,
			totalTime: 5678,
		}).toString();
		expect(out).toContain("1234/5678");
	});

	it("shows shuffle and repeat", () => {
		const out = new Playing({
			shuffle: ShuffleState.Songs,
			repeat: RepeatState.Track,
		}).toString();
		expect(out).toContain("Shuffle: Songs");
		expect(out).toContain("Repeat: Track");
	});

	it("generates consistent hash", () => {
		const playing = new Playing({
			title: "title",
			artist: "artist",
			album: "album",
			totalTime: 123,
		});
		expect(playing.hash).toBe(
			"538df531d1715629fdd87affd0c5957bcbf54cd89180778071e6535b7df4e22c",
		);

		const playing2 = new Playing({
			title: "dummy",
			artist: "test",
			album: "none",
			totalTime: 321,
		});
		expect(playing2.hash).toBe(
			"80045c05d18382f33a5369fd5cdfc6ae42c3eb418125f638d7a31ab173b01ade",
		);
	});

	it("uses custom hash if provided", () => {
		const playing = new Playing({ hash: "dummy" });
		expect(playing.hash).toBe("dummy");
	});

	it.each(eqTestCases)("field equality for %s", (prop, value1, value2) => {
		const playing1 = new Playing({ [prop]: value1 });
		const playing2 = new Playing({ [prop]: value2 });
		const playing3 = new Playing({ [prop]: value2 });

		expect(playing1.equals(playing1)).toBe(true);
		expect(playing1.equals(playing2)).toBe(false);
		expect(playing2.equals(playing3)).toBe(true);
	});

	it.each(eqTestCases)("init field value for %s", (prop, value1, _value2) => {
		const playing = new Playing({ [prop]: value1 });
		expect((playing as unknown as Record<string, unknown>)[prop]).toBe(value1);
	});
});

// DEVICE INFO

describe("DeviceInfo", () => {
	it("defaults to unknown for empty properties", () => {
		const info = new DeviceInfo({});
		expect(info.operatingSystem).toBe(OperatingSystem.Unknown);
		expect(info.version).toBeNull();
		expect(info.buildNumber).toBeNull();
		expect(info.model).toBe(DeviceModel.Unknown);
		expect(info.mac).toBeNull();
		expect(info.outputDeviceId).toBeNull();
	});

	it("reads all properties", () => {
		const info = new DeviceInfo({
			[DeviceInfo.OPERATING_SYSTEM]: OperatingSystem.TvOS,
			[DeviceInfo.VERSION]: "1.0",
			[DeviceInfo.BUILD_NUMBER]: "ABC",
			[DeviceInfo.MODEL]: DeviceModel.Gen3,
			[DeviceInfo.MAC]: "AA:BB:CC:DD:EE:FF",
			[DeviceInfo.OUTPUT_DEVICE_ID]: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
		});
		expect(info.operatingSystem).toBe(OperatingSystem.TvOS);
		expect(info.version).toBe("1.0");
		expect(info.buildNumber).toBe("ABC");
		expect(info.model).toBe(DeviceModel.Gen3);
		expect(info.mac).toBe("AA:BB:CC:DD:EE:FF");
		expect(info.outputDeviceId).toBe("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE");
	});

	it.each([
		[
			{ [DeviceInfo.MODEL]: DeviceModel.AirPortExpress },
			OperatingSystem.AirPortOS,
		],
		[
			{ [DeviceInfo.MODEL]: DeviceModel.AirPortExpressGen2 },
			OperatingSystem.AirPortOS,
		],
		[{ [DeviceInfo.MODEL]: DeviceModel.HomePod }, OperatingSystem.TvOS],
		[{ [DeviceInfo.MODEL]: DeviceModel.HomePodMini }, OperatingSystem.TvOS],
		[{ [DeviceInfo.MODEL]: DeviceModel.Gen2 }, OperatingSystem.TvOS],
		[{ [DeviceInfo.MODEL]: DeviceModel.Gen3 }, OperatingSystem.TvOS],
		[{ [DeviceInfo.MODEL]: DeviceModel.Gen4 }, OperatingSystem.TvOS],
		[{ [DeviceInfo.MODEL]: DeviceModel.Gen4K }, OperatingSystem.TvOS],
		[{ [DeviceInfo.MODEL]: DeviceModel.AppleTV4KGen2 }, OperatingSystem.TvOS],
		[{ [DeviceInfo.MODEL]: DeviceModel.AppleTV4KGen3 }, OperatingSystem.TvOS],
	] as [
		Record<string, unknown>,
		OperatingSystem,
	][])("guesses OS from model", (properties, expectedOs) => {
		expect(new DeviceInfo(properties).operatingSystem).toBe(expectedOs);
	});

	it("raw model", () => {
		expect(new DeviceInfo({ [DeviceInfo.RAW_MODEL]: "raw" }).rawModel).toBe(
			"raw",
		);
	});

	it("Apple TV 3 string", () => {
		const info = new DeviceInfo({
			[DeviceInfo.OPERATING_SYSTEM]: OperatingSystem.Legacy,
			[DeviceInfo.VERSION]: "2.2.3",
			[DeviceInfo.BUILD_NUMBER]: "13D333",
			[DeviceInfo.MODEL]: DeviceModel.Gen3,
			[DeviceInfo.MAC]: "aa:bb:cc:dd:ee:ff",
		});
		expect(info.toString()).toBe("Apple TV 3, ATV SW 2.2.3 build 13D333");
	});

	it("HomePod Mini string", () => {
		const info = new DeviceInfo({
			[DeviceInfo.OPERATING_SYSTEM]: OperatingSystem.TvOS,
			[DeviceInfo.VERSION]: "1.2.3",
			[DeviceInfo.BUILD_NUMBER]: "19A123",
			[DeviceInfo.MODEL]: DeviceModel.HomePodMini,
			[DeviceInfo.MAC]: "aa:bb:cc:dd:ee:ff",
		});
		expect(info.toString()).toBe("HomePod Mini, tvOS 1.2.3 build 19A123");
	});

	it("unknown string", () => {
		expect(new DeviceInfo({}).toString()).toBe("Unknown, Unknown OS");
	});

	it("raw model string", () => {
		expect(new DeviceInfo({ [DeviceInfo.RAW_MODEL]: "raw" }).toString()).toBe(
			"raw, Unknown OS",
		);
	});

	it.each([
		[DeviceModel.Unknown, "raw", "raw"],
		[DeviceModel.Gen3, "raw", "Apple TV 3"],
	] as [
		DeviceModel,
		string,
		string,
	][])("modelStr for model=%s raw=%s", (model, rawModel, expected) => {
		const info: Record<string, unknown> = {};
		if (model !== undefined) info[DeviceInfo.MODEL] = model;
		if (rawModel !== undefined) info[DeviceInfo.RAW_MODEL] = rawModel;
		expect(new DeviceInfo(info).modelStr).toBe(expected);
	});
});

// FEATURES

describe("Features", () => {
	it("all unsupported features returns empty", () => {
		const features = new FeaturesDummy(
			new Map([[FeatureName.Play, FeatureState.Unsupported]]),
		);
		expect(features.allFeatures().size).toBe(0);
	});

	it("all features including unsupported", () => {
		const features = new FeaturesDummy(
			new Map([[FeatureName.Play, FeatureState.Unsupported]]),
		);
		const all = features.allFeatures(true);
		// Should include all FeatureName values
		const featureNameCount = Object.values(FeatureName).filter(
			(v) => typeof v === "number",
		).length;
		expect(all.size).toBe(featureNameCount);
	});

	it("inState works correctly", () => {
		const features = new FeaturesDummy(
			new Map([
				[FeatureName.Play, FeatureState.Unsupported],
				[FeatureName.Pause, FeatureState.Available],
			]),
		);

		expect(features.inState(FeatureState.Unknown, FeatureName.Play)).toBe(
			false,
		);
		expect(features.inState([FeatureState.Unknown], FeatureName.Play)).toBe(
			false,
		);
		expect(features.inState(FeatureState.Unsupported, FeatureName.Play)).toBe(
			true,
		);
		expect(features.inState([FeatureState.Unsupported], FeatureName.Play)).toBe(
			true,
		);

		expect(
			features.inState(
				[FeatureState.Unsupported],
				FeatureName.Play,
				FeatureName.Pause,
			),
		).toBe(false);

		expect(
			features.inState(
				[FeatureState.Unsupported, FeatureState.Available],
				FeatureName.Play,
				FeatureName.Pause,
			),
		).toBe(true);
	});
});

// APP

describe("App", () => {
	it("has correct properties", () => {
		const app = new App("name", "id");
		expect(app.name).toBe("name");
		expect(app.identifier).toBe("id");
	});

	it("toString", () => {
		const app = new App("name", "id");
		expect(app.toString()).toBe("App: name (id)");
	});

	it("equality", () => {
		expect(new App(null, "a").equals(new App(null, "a"))).toBe(true);
		expect(new App("test", "a").equals(new App(null, "a"))).toBe(false);
		expect(new App("test", "a").equals(new App("test", "a"))).toBe(true);
		expect(new App(null, "test").equals(new App(null, "a"))).toBe(false);
		expect(new App(null, "test").equals(new App(null, "test"))).toBe(true);
		expect(new App("test", "test2").equals(new App("test", "test2"))).toBe(
			true,
		);
	});
});

// USER ACCOUNT

describe("UserAccount", () => {
	it("has correct properties", () => {
		const account = new UserAccount("name", "id");
		expect(account.name).toBe("name");
		expect(account.identifier).toBe("id");
	});

	it("toString", () => {
		const account = new UserAccount("name", "id");
		expect(account.toString()).toBe("Account: name (id)");
	});

	it("equality", () => {
		expect(new UserAccount("a", "b").equals(new UserAccount("a", "b"))).toBe(
			true,
		);
		expect(new UserAccount("a", "b").equals(new UserAccount("c", "b"))).toBe(
			false,
		);
	});
});
