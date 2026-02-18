import { describe, expect, it } from "vitest";
import { DeviceModel, OperatingSystem } from "../../src/const.js";
import {
	lookupInternalName,
	lookupModel,
	lookupOs,
	lookupVersion,
} from "../../src/support/deviceInfo.js";

describe("lookupModel", () => {
	it.each([
		["AppleTV6,2", DeviceModel.Gen4K],
		["AudioAccessory5,1", DeviceModel.HomePodMini],
		["bad_model", DeviceModel.Unknown],
	])("lookupModel(%s) = %s", (modelStr, expected) => {
		expect(lookupModel(modelStr)).toBe(expected);
	});
});

describe("lookupInternalName", () => {
	it.each([
		["J105aAP", DeviceModel.Gen4K],
		["bad_name", DeviceModel.Unknown],
	])("lookupInternalName(%s) = %s", (name, expected) => {
		expect(lookupInternalName(name)).toBe(expected);
	});
});

describe("lookupVersion", () => {
	it.each([
		[null, null],
		["17J586", "13.0"],
		["bad_version", null],
		["16F123", "12.x"],
		["17F123", "13.x"],
	] as const)("lookupVersion(%s) = %s", (version, expected) => {
		expect(lookupVersion(version as string | null)).toBe(expected);
	});
});

describe("lookupOs", () => {
	it.each([
		["bad", OperatingSystem.Unknown],
		["MacBookAir10,1", OperatingSystem.MacOS],
		["iMac1,2", OperatingSystem.MacOS],
		["Macmini1,1", OperatingSystem.MacOS],
		["MacBookPro5,67", OperatingSystem.MacOS],
		["Mac1,4", OperatingSystem.MacOS],
		["MacPro19,4", OperatingSystem.MacOS],
	] as const)("lookupOs(%s) = %s (string)", (id, expected) => {
		expect(lookupOs(id as string)).toBe(expected);
	});

	it.each([
		[DeviceModel.AirPortExpress, OperatingSystem.AirPortOS],
		[DeviceModel.AirPortExpressGen2, OperatingSystem.AirPortOS],
		[DeviceModel.HomePod, OperatingSystem.TvOS],
		[DeviceModel.HomePodGen2, OperatingSystem.TvOS],
		[DeviceModel.HomePodMini, OperatingSystem.TvOS],
		[DeviceModel.AppleTVGen1, OperatingSystem.Legacy],
		[DeviceModel.Gen2, OperatingSystem.Legacy],
		[DeviceModel.Gen3, OperatingSystem.Legacy],
		[DeviceModel.Gen4, OperatingSystem.TvOS],
		[DeviceModel.Gen4K, OperatingSystem.TvOS],
		[DeviceModel.AppleTV4KGen2, OperatingSystem.TvOS],
		[DeviceModel.AppleTV4KGen3, OperatingSystem.TvOS],
	] as const)("lookupOs(%s) = %s (DeviceModel)", (model, expected) => {
		expect(lookupOs(model)).toBe(expected);
	});
});
