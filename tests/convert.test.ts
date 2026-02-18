import { describe, expect, it } from "vitest";
import {
	DeviceModel,
	DeviceState,
	MediaType,
	Protocol,
	RepeatState,
	ShuffleState,
} from "../src/const.js";
import {
	deviceStateStr,
	mediaTypeStr,
	modelStr,
	protocolStr,
	repeatStr,
	shuffleStr,
} from "../src/convert.js";

describe("deviceStateStr", () => {
	it("converts all device states", () => {
		expect(deviceStateStr(null)).toBe("Idle");
		expect(deviceStateStr(DeviceState.Idle)).toBe("Idle");
		expect(deviceStateStr(DeviceState.Loading)).toBe("Loading");
		expect(deviceStateStr(DeviceState.Stopped)).toBe("Stopped");
		expect(deviceStateStr(DeviceState.Paused)).toBe("Paused");
		expect(deviceStateStr(DeviceState.Playing)).toBe("Playing");
		expect(deviceStateStr(DeviceState.Seeking)).toBe("Seeking");
		expect(deviceStateStr(999 as DeviceState)).toBe("Unsupported");
	});
});

describe("mediaTypeStr", () => {
	it("converts all media types", () => {
		expect(mediaTypeStr(MediaType.Unknown)).toBe("Unknown");
		expect(mediaTypeStr(MediaType.Video)).toBe("Video");
		expect(mediaTypeStr(MediaType.Music)).toBe("Music");
		expect(mediaTypeStr(MediaType.TV)).toBe("TV");
		expect(mediaTypeStr(999 as MediaType)).toBe("Unsupported");
	});
});

describe("repeatStr", () => {
	it("converts all repeat states", () => {
		expect(repeatStr(RepeatState.Off)).toBe("Off");
		expect(repeatStr(RepeatState.Track)).toBe("Track");
		expect(repeatStr(RepeatState.All)).toBe("All");
		expect(repeatStr(999 as RepeatState)).toBe("Unsupported");
	});
});

describe("shuffleStr", () => {
	it("converts all shuffle states", () => {
		expect(shuffleStr(ShuffleState.Off)).toBe("Off");
		expect(shuffleStr(ShuffleState.Albums)).toBe("Albums");
		expect(shuffleStr(ShuffleState.Songs)).toBe("Songs");
		expect(shuffleStr(999 as ShuffleState)).toBe("Unsupported");
	});
});

describe("protocolStr", () => {
	it("converts all protocols", () => {
		expect(protocolStr(Protocol.MRP)).toBe("MRP");
		expect(protocolStr(Protocol.DMAP)).toBe("DMAP");
		expect(protocolStr(Protocol.AirPlay)).toBe("AirPlay");
		expect(protocolStr(Protocol.Companion)).toBe("Companion");
		expect(protocolStr(Protocol.RAOP)).toBe("RAOP");
		expect(protocolStr(999 as Protocol)).toBe("Unknown");
	});
});

describe("modelStr", () => {
	it("converts all models", () => {
		expect(modelStr(DeviceModel.AppleTVGen1)).toBe("Apple TV 1");
		expect(modelStr(DeviceModel.Gen2)).toBe("Apple TV 2");
		expect(modelStr(DeviceModel.Gen3)).toBe("Apple TV 3");
		expect(modelStr(DeviceModel.Gen4)).toBe("Apple TV 4");
		expect(modelStr(DeviceModel.Gen4K)).toBe("Apple TV 4K");
		expect(modelStr(DeviceModel.HomePod)).toBe("HomePod");
		expect(modelStr(DeviceModel.HomePodMini)).toBe("HomePod Mini");
		expect(modelStr(DeviceModel.AirPortExpress)).toBe(
			"AirPort Express (gen 1)",
		);
		expect(modelStr(DeviceModel.AirPortExpressGen2)).toBe(
			"AirPort Express (gen 2)",
		);
		expect(modelStr(DeviceModel.AppleTV4KGen2)).toBe("Apple TV 4K (gen 2)");
		expect(modelStr(DeviceModel.Music)).toBe("Music/iTunes");
		expect(modelStr(DeviceModel.AppleTV4KGen3)).toBe("Apple TV 4K (gen 3)");
		expect(modelStr(DeviceModel.HomePodGen2)).toBe("HomePod (gen 2)");
		expect(modelStr(DeviceModel.Unknown)).toBe("Unknown");
	});
});
