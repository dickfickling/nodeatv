import { describe, expect, it } from "vitest";
import { FeatureName, FeatureState, Protocol } from "../../../src/const.js";
import { DeviceInfo } from "../../../src/interface.js";
import {
	AirPlayFeatures,
	AirPlayFlags,
	deviceInfo,
	hasFlag,
	parseFeatures,
	scan,
} from "../../../src/protocols/airplay/index.js";

describe("scan", () => {
	it("returns handler for _airplay._tcp.local", () => {
		const handlers = scan();
		expect(handlers).toHaveProperty("_airplay._tcp.local");
	});

	it("handler returns service and name", () => {
		const handlers = scan();
		const [handler] = handlers["_airplay._tcp.local"];
		const result = handler(
			{
				type: "_airplay._tcp.local",
				name: "Test ATV",
				port: 7000,
				properties: { deviceid: "AA:BB:CC:DD:EE:FF" },
			},
			{ answers: [], additionals: [], authorities: [] },
		);

		expect(result).not.toBeNull();
		expect(result?.[0]).toBe("Test ATV");
		expect(result?.[1].port).toBe(7000);
		expect(result?.[1].protocol).toBe(Protocol.AirPlay);
	});
});

describe("AirPlayFeatures", () => {
	it("PlayUrl is available when video V1 supported", () => {
		const features = new AirPlayFeatures(AirPlayFlags.SupportsAirPlayVideoV1);
		const info = features.getFeature(FeatureName.PlayUrl);
		expect(info.state).toBe(FeatureState.Available);
	});

	it("PlayUrl is available when video V2 supported", () => {
		const features = new AirPlayFeatures(AirPlayFlags.SupportsAirPlayVideoV2);
		const info = features.getFeature(FeatureName.PlayUrl);
		expect(info.state).toBe(FeatureState.Available);
	});

	it("Stop is always available", () => {
		const features = new AirPlayFeatures(0n);
		const info = features.getFeature(FeatureName.Stop);
		expect(info.state).toBe(FeatureState.Available);
	});

	it("other features are unavailable", () => {
		const features = new AirPlayFeatures(0n);
		const info = features.getFeature(FeatureName.Play);
		expect(info.state).toBe(FeatureState.Unavailable);
	});

	it("PlayUrl unavailable when no video flags", () => {
		const features = new AirPlayFeatures(AirPlayFlags.SupportsAirPlayAudio);
		const info = features.getFeature(FeatureName.PlayUrl);
		expect(info.state).toBe(FeatureState.Unavailable);
	});
});

describe("deviceInfo", () => {
	it("extracts model information", () => {
		const info = deviceInfo("_airplay._tcp.local", {
			model: "AppleTV6,2",
		});
		expect(info[DeviceInfo.RAW_MODEL]).toBe("AppleTV6,2");
	});

	it("extracts version information", () => {
		const info = deviceInfo("_airplay._tcp.local", {
			osvers: "14.5",
		});
		expect(info[DeviceInfo.VERSION]).toBe("14.5");
	});

	it("extracts MAC from deviceid", () => {
		const info = deviceInfo("_airplay._tcp.local", {
			deviceid: "AA:BB:CC:DD:EE:FF",
		});
		expect(info[DeviceInfo.MAC]).toBe("AA:BB:CC:DD:EE:FF");
	});

	it("extracts output device id from psi", () => {
		const info = deviceInfo("_airplay._tcp.local", {
			psi: "some-psi-id",
		});
		expect(info[DeviceInfo.OUTPUT_DEVICE_ID]).toBe("some-psi-id");
	});

	it("falls back to pi for output device id", () => {
		const info = deviceInfo("_airplay._tcp.local", {
			pi: "some-pi-id",
		});
		expect(info[DeviceInfo.OUTPUT_DEVICE_ID]).toBe("some-pi-id");
	});

	it("returns empty object for no properties", () => {
		const info = deviceInfo("_airplay._tcp.local", {});
		expect(Object.keys(info).length).toBe(0);
	});
});

describe("parseFeatures and hasFlag", () => {
	it("can detect unified media control", () => {
		const features = parseFeatures("0x00000000,0x00000040");
		expect(hasFlag(features, AirPlayFlags.SupportsUnifiedMediaControl)).toBe(
			true,
		);
	});

	it("can detect core utils pairing (bit 48)", () => {
		// Bit 48 = 0x10000 in upper 32 bits
		const features = parseFeatures("0x00000000,0x00010000");
		expect(
			hasFlag(features, AirPlayFlags.SupportsCoreUtilsPairingAndEncryption),
		).toBe(true);
	});
});
