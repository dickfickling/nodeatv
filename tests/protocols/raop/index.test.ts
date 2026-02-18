import { describe, expect, it } from "vitest";
import { FeatureName, FeatureState, Protocol } from "../../../src/const.js";
import {
	RaopFeatures,
	RaopPlaybackManager,
	raopNameFromServiceName,
	scan,
} from "../../../src/protocols/raop/index.js";

describe("raopNameFromServiceName", () => {
	it("should strip MAC prefix from service name", () => {
		expect(raopNameFromServiceName("AABBCCDDEEFF@Living Room")).toBe(
			"Living Room",
		);
	});

	it("should return name as-is if no @ present", () => {
		expect(raopNameFromServiceName("Living Room")).toBe("Living Room");
	});

	it("should handle multiple @ signs", () => {
		expect(raopNameFromServiceName("AA@BB@CC")).toBe("BB@CC");
	});
});

describe("scan", () => {
	it("should return handlers for _raop._tcp.local", () => {
		const handlers = scan();
		expect("_raop._tcp.local" in handlers).toBe(true);
	});

	it("should return handlers for _airport._tcp.local", () => {
		const handlers = scan();
		expect("_airport._tcp.local" in handlers).toBe(true);
	});

	it("should have two handlers", () => {
		const handlers = scan();
		expect(Object.keys(handlers).length).toBe(2);
	});

	it("raop handler should parse service correctly", () => {
		const handlers = scan();
		const [handler] = handlers["_raop._tcp.local"];
		const result = handler(
			{
				type: "_raop._tcp.local",
				name: "AABBCCDDEEFF@Test Speaker",
				address: "192.168.1.100",
				port: 7000,
				properties: { pk: "abcdef123456" },
			},
			{ services: [], deepSleep: false, model: null },
		);

		expect(result).not.toBeNull();
		if (result) {
			const [name, service] = result;
			expect(name).toBe("Test Speaker");
			expect(service.protocol).toBe(Protocol.RAOP);
			expect(service.port).toBe(7000);
		}
	});

	it("airport handler should return null for service", () => {
		const handlers = scan();
		const [handler] = handlers["_airport._tcp.local"];
		const result = handler(
			{
				type: "_airport._tcp.local",
				name: "Test",
				address: "192.168.1.100",
				port: 5000,
				properties: {},
			},
			{ services: [], deepSleep: false, model: null },
		);
		expect(result).toBeNull();
	});
});

describe("RaopFeatures", () => {
	it("should report StreamFile as available", () => {
		// Create a minimal playback manager with necessary dependencies
		const mockCore = {
			config: { address: "127.0.0.1", properties: {} },
			service: { port: 7000, properties: {} },
			settings: { protocols: { raop: {} } },
			stateDispatcher: {
				listenTo: () => {},
				dispatch: () => [],
			},
		} as unknown;
		const playbackManager = new RaopPlaybackManager(
			mockCore as import("../../../src/core/core.js").Core,
		);
		const features = new RaopFeatures(playbackManager);

		const feature = features.getFeature(FeatureName.StreamFile);
		expect(feature.state).toBe(FeatureState.Available);
	});

	it("should report volume features as available", () => {
		const mockCore = {
			config: { address: "127.0.0.1", properties: {} },
			service: { port: 7000, properties: {} },
			settings: { protocols: { raop: {} } },
			stateDispatcher: {
				listenTo: () => {},
				dispatch: () => [],
			},
		} as unknown;
		const playbackManager = new RaopPlaybackManager(
			mockCore as import("../../../src/core/core.js").Core,
		);
		const features = new RaopFeatures(playbackManager);

		expect(features.getFeature(FeatureName.Volume).state).toBe(
			FeatureState.Available,
		);
		expect(features.getFeature(FeatureName.SetVolume).state).toBe(
			FeatureState.Available,
		);
		expect(features.getFeature(FeatureName.VolumeUp).state).toBe(
			FeatureState.Available,
		);
		expect(features.getFeature(FeatureName.VolumeDown).state).toBe(
			FeatureState.Available,
		);
	});

	it("should report Stop as unavailable when not streaming", () => {
		const mockCore = {
			config: { address: "127.0.0.1", properties: {} },
			service: { port: 7000, properties: {} },
			settings: { protocols: { raop: {} } },
			stateDispatcher: {
				listenTo: () => {},
				dispatch: () => [],
			},
		} as unknown;
		const playbackManager = new RaopPlaybackManager(
			mockCore as import("../../../src/core/core.js").Core,
		);
		const features = new RaopFeatures(playbackManager);

		expect(features.getFeature(FeatureName.Stop).state).toBe(
			FeatureState.Unavailable,
		);
	});
});
