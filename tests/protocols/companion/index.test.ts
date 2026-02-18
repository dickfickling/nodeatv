import { describe, expect, it } from "vitest";
import { FeatureName, FeatureState } from "../../../src/const.js";
import type { CompanionAPI } from "../../../src/protocols/companion/api.js";
import type { CompanionPower } from "../../../src/protocols/companion/index.js";
import {
	CompanionFeatures,
	scan,
} from "../../../src/protocols/companion/index.js";

function makeMockApi() {
	const listeners = new Map<
		string,
		Array<(data: Record<string, unknown>) => void>
	>();
	return {
		listenTo(
			event: string,
			handler: (data: Record<string, unknown>) => void,
		): void {
			if (!listeners.has(event)) {
				listeners.set(event, []);
			}
			listeners.get(event)?.push(handler);
		},
		dispatch(event: string, data: Record<string, unknown>): void {
			const handlers = listeners.get(event) ?? [];
			for (const h of handlers) {
				h(data);
			}
		},
	};
}

function makeMockPower(supportsPowerUpdates = false) {
	return {
		supportsPowerUpdates,
	};
}

describe("scan", () => {
	it("returns handler for companion-link service type", () => {
		const handlers = scan();
		expect(handlers).toHaveProperty("_companion-link._tcp.local");
	});

	it("returns exactly one service type", () => {
		const handlers = scan();
		expect(Object.keys(handlers)).toHaveLength(1);
	});
});

describe("CompanionFeatures", () => {
	it("returns Available for always-supported features", () => {
		const api = makeMockApi();
		const power = makeMockPower();
		const features = new CompanionFeatures(
			api as unknown as CompanionAPI,
			power as unknown as CompanionPower,
		);

		const alwaysAvailable = [
			FeatureName.Up,
			FeatureName.Down,
			FeatureName.Left,
			FeatureName.Right,
			FeatureName.Select,
			FeatureName.Menu,
			FeatureName.Home,
			FeatureName.VolumeUp,
			FeatureName.VolumeDown,
			FeatureName.PlayPause,
			FeatureName.AppList,
			FeatureName.LaunchApp,
			FeatureName.AccountList,
			FeatureName.SwitchAccount,
			FeatureName.TurnOn,
			FeatureName.TurnOff,
			FeatureName.TextFocusState,
			FeatureName.TextGet,
			FeatureName.TextClear,
			FeatureName.TextAppend,
			FeatureName.TextSet,
			FeatureName.Swipe,
			FeatureName.Action,
			FeatureName.Click,
			FeatureName.ChannelUp,
			FeatureName.ChannelDown,
			FeatureName.Screensaver,
			FeatureName.Guide,
			FeatureName.ControlCenter,
		];

		for (const f of alwaysAvailable) {
			expect(features.getFeature(f).state).toBe(FeatureState.Available);
		}
	});

	it("returns Unavailable for media control features when no flags set", () => {
		const api = makeMockApi();
		const power = makeMockPower();
		const features = new CompanionFeatures(
			api as unknown as CompanionAPI,
			power as unknown as CompanionPower,
		);

		// Media control features depend on _mcF flags being set
		expect(features.getFeature(FeatureName.Play).state).toBe(
			FeatureState.Unavailable,
		);
		expect(features.getFeature(FeatureName.Pause).state).toBe(
			FeatureState.Unavailable,
		);
		expect(features.getFeature(FeatureName.Next).state).toBe(
			FeatureState.Unavailable,
		);
		expect(features.getFeature(FeatureName.Previous).state).toBe(
			FeatureState.Unavailable,
		);
	});

	it("returns Available for media control features when flags are set", () => {
		const api = makeMockApi();
		const power = makeMockPower();
		const features = new CompanionFeatures(
			api as unknown as CompanionAPI,
			power as unknown as CompanionPower,
		);

		// Simulate receiving control flags: Play(0x1) | Pause(0x2) | Volume(0x100)
		api.dispatch("_iMC", { _mcF: 0x0103 });

		expect(features.getFeature(FeatureName.Play).state).toBe(
			FeatureState.Available,
		);
		expect(features.getFeature(FeatureName.Pause).state).toBe(
			FeatureState.Available,
		);
		expect(features.getFeature(FeatureName.Volume).state).toBe(
			FeatureState.Available,
		);
		expect(features.getFeature(FeatureName.SetVolume).state).toBe(
			FeatureState.Available,
		);
	});

	it("returns Unsupported for PowerState when power updates not available", () => {
		const api = makeMockApi();
		const power = makeMockPower(false);
		const features = new CompanionFeatures(
			api as unknown as CompanionAPI,
			power as unknown as CompanionPower,
		);
		expect(features.getFeature(FeatureName.PowerState).state).toBe(
			FeatureState.Unsupported,
		);
	});

	it("returns Available for PowerState when power updates available", () => {
		const api = makeMockApi();
		const power = makeMockPower(true);
		const features = new CompanionFeatures(
			api as unknown as CompanionAPI,
			power as unknown as CompanionPower,
		);
		expect(features.getFeature(FeatureName.PowerState).state).toBe(
			FeatureState.Available,
		);
	});

	it("returns Unavailable for unknown features", () => {
		const api = makeMockApi();
		const power = makeMockPower();
		const features = new CompanionFeatures(
			api as unknown as CompanionAPI,
			power as unknown as CompanionPower,
		);
		// Artwork is not in the supported set for Companion
		expect(features.getFeature(FeatureName.Artwork).state).toBe(
			FeatureState.Unavailable,
		);
	});
});
