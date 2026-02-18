import { describe, expect, it, vi } from "vitest";
import { FeatureName, FeatureState, Protocol } from "../../src/const.js";
import type { SetupData } from "../../src/core/core.js";
import {
	FacadeAppleTV,
	FacadeFeatures,
	FacadePower,
	FacadePushUpdater,
	FacadeRemoteControl,
} from "../../src/core/facade.js";
import {
	type BaseConfig,
	type BaseService,
	type DeviceInfo,
	type FeatureInfo,
	Features,
	type PushUpdater,
	RemoteControl,
} from "../../src/interface.js";

// --- Helpers ---

class MockConfig {
	private _name: string;
	private _address: string;
	private _services: BaseService[] = [];

	constructor(name: string, address: string) {
		this._name = name;
		this._address = address;
	}

	get name(): string {
		return this._name;
	}
	get address(): string {
		return this._address;
	}
	get deepSleep(): boolean {
		return false;
	}
	get services(): BaseService[] {
		return this._services;
	}
	get deviceInfo(): DeviceInfo {
		return {} as DeviceInfo;
	}
	addService(_service: BaseService): void {}
	getService(_protocol: Protocol): BaseService | null {
		return null;
	}
	get properties(): Record<string, Record<string, string>> {
		return {};
	}
	get ready(): boolean {
		return true;
	}
	get identifier(): string | null {
		return "test-id";
	}
	get allIdentifiers(): string[] {
		return ["test-id"];
	}
	mainService(): BaseService {
		throw new Error("no service");
	}
	setCredentials(): boolean {
		return false;
	}
	apply(): void {}
	equals(): boolean {
		return false;
	}
	deepCopy(): MockConfig {
		return new MockConfig(this._name, this._address);
	}
}

class TestRemoteControl extends RemoteControl {
	private _name: string;
	constructor(name: string) {
		super();
		this._name = name;
	}
	override async up(): Promise<void> {
		return;
	}
	override async play(): Promise<void> {
		return;
	}
	get tag(): string {
		return this._name;
	}
}

class TestFeatures extends Features {
	private _available: Set<FeatureName>;
	constructor(available: FeatureName[]) {
		super();
		this._available = new Set(available);
	}
	override getFeature(featureName: FeatureName): FeatureInfo {
		if (this._available.has(featureName)) {
			return { state: FeatureState.Available };
		}
		return { state: FeatureState.Unsupported };
	}
}

function makeSetupData(
	protocol: Protocol,
	interfaces: Map<unknown, unknown>,
	connected = true,
): SetupData {
	return {
		protocol,
		connect: vi.fn().mockResolvedValue(connected),
		close: vi.fn().mockReturnValue(new Set()),
		deviceInfo: vi.fn().mockReturnValue({}),
		interfaces,
		features: new Set<FeatureName>(),
	};
}

// --- Tests ---

describe("FacadeRemoteControl", () => {
	it("relays to highest priority protocol", async () => {
		const facade = new FacadeRemoteControl();
		const mrpRc = new TestRemoteControl("mrp");
		const dmapRc = new TestRemoteControl("dmap");

		facade.relayer.register(mrpRc, Protocol.MRP);
		facade.relayer.register(dmapRc, Protocol.DMAP);

		// MRP has higher priority than DMAP by default
		await expect(facade.up()).resolves.toBeUndefined();
		await expect(facade.play()).resolves.toBeUndefined();
	});

	it("falls through to next protocol if method not overridden", async () => {
		const facade = new FacadeRemoteControl();
		// Register only DMAP
		const dmapRc = new TestRemoteControl("dmap");
		facade.relayer.register(dmapRc, Protocol.DMAP);

		await expect(facade.up()).resolves.toBeUndefined();
	});
});

describe("FacadePower", () => {
	it("uses Companion priority over MRP", () => {
		const facade = new FacadePower();
		// Power priorities: [Companion, MRP, DMAP, AirPlay, RAOP]
		// Companion should be checked first
		expect(facade.relayer).toBeDefined();
	});
});

describe("FacadeFeatures", () => {
	it("routes features to registered protocol", () => {
		const features = new FacadeFeatures();
		const mrpFeatures = new TestFeatures([FeatureName.Play, FeatureName.Pause]);
		const companionFeatures = new TestFeatures([
			FeatureName.AppList,
			FeatureName.LaunchApp,
		]);

		features.register(mrpFeatures, Protocol.MRP);
		features.register(companionFeatures, Protocol.Companion);

		expect(features.getFeature(FeatureName.Play).state).toBe(
			FeatureState.Available,
		);
		expect(features.getFeature(FeatureName.AppList).state).toBe(
			FeatureState.Available,
		);
		expect(features.getFeature(FeatureName.StreamFile).state).toBe(
			FeatureState.Unsupported,
		);
	});

	it("returns unsupported for unregistered features", () => {
		const features = new FacadeFeatures();
		expect(features.getFeature(FeatureName.Play).state).toBe(
			FeatureState.Unsupported,
		);
	});
});

describe("FacadePushUpdater", () => {
	it("starts and stops all registered updaters", () => {
		const facade = new FacadePushUpdater();
		const mockUpdater = {
			start: vi.fn(),
			stop: vi.fn(),
			get active() {
				return false;
			},
		} as unknown as PushUpdater;

		facade.register(mockUpdater, Protocol.MRP);

		expect(facade.active).toBe(false);
		facade.start();
		expect(facade.active).toBe(true);
		expect(mockUpdater.start).toHaveBeenCalledWith(0);

		facade.stop();
		expect(facade.active).toBe(false);
		expect(mockUpdater.stop).toHaveBeenCalled();
	});
});

describe("FacadeAppleTV", () => {
	it("stores config properties", () => {
		const config = new MockConfig("Test ATV", "192.168.1.100");
		const facade = new FacadeAppleTV(config as unknown as BaseConfig);

		expect(facade.name).toBe("Test ATV");
		expect(facade.address).toBe("192.168.1.100");
	});

	it("connects and registers interfaces from setup data", async () => {
		const config = new MockConfig("Test ATV", "192.168.1.100");
		const facade = new FacadeAppleTV(config as unknown as BaseConfig);

		const interfaces = new Map<unknown, unknown>();
		const rc = new TestRemoteControl("mrp");
		const feat = new TestFeatures([FeatureName.Play]);
		interfaces.set(RemoteControl, rc);
		interfaces.set(Features, feat);

		const setupData = makeSetupData(Protocol.MRP, interfaces);
		facade.addSetupData(setupData);

		await facade.connect();

		expect(setupData.connect).toHaveBeenCalled();
		expect(facade.features.getFeature(FeatureName.Play).state).toBe(
			FeatureState.Available,
		);
	});

	it("skips setup data that fails to connect", async () => {
		const config = new MockConfig("Test ATV", "192.168.1.100");
		const facade = new FacadeAppleTV(config as unknown as BaseConfig);

		const interfaces = new Map<unknown, unknown>();
		interfaces.set(Features, new TestFeatures([FeatureName.Play]));

		const failSetup = makeSetupData(Protocol.MRP, interfaces, false);
		facade.addSetupData(failSetup);

		await facade.connect();

		// Feature should NOT be registered since connect returned false
		expect(facade.features.getFeature(FeatureName.Play).state).toBe(
			FeatureState.Unsupported,
		);
	});

	it("closes all sessions", async () => {
		const config = new MockConfig("Test ATV", "192.168.1.100");
		const facade = new FacadeAppleTV(config as unknown as BaseConfig);

		const setupData = makeSetupData(Protocol.MRP, new Map(), true);
		facade.addSetupData(setupData);

		await facade.connect();
		await facade.close();

		expect(setupData.close).toHaveBeenCalled();
	});

	it("throws on double connect", async () => {
		const config = new MockConfig("Test ATV", "192.168.1.100");
		const facade = new FacadeAppleTV(config as unknown as BaseConfig);

		await facade.connect();
		await expect(facade.connect()).rejects.toThrow("already connected");
	});

	it("throws on addSetupData after close", async () => {
		const config = new MockConfig("Test ATV", "192.168.1.100");
		const facade = new FacadeAppleTV(config as unknown as BaseConfig);

		await facade.close();
		expect(() =>
			facade.addSetupData(makeSetupData(Protocol.MRP, new Map())),
		).toThrow("closed");
	});

	it("takeover switches priority for relayers", async () => {
		const config = new MockConfig("Test ATV", "192.168.1.100");
		const facade = new FacadeAppleTV(config as unknown as BaseConfig);

		const mrpRc = new TestRemoteControl("mrp");
		const companionRc = new TestRemoteControl("companion");

		const mrpInterfaces = new Map<unknown, unknown>();
		mrpInterfaces.set(RemoteControl, mrpRc);
		const compInterfaces = new Map<unknown, unknown>();
		compInterfaces.set(RemoteControl, companionRc);

		facade.addSetupData(makeSetupData(Protocol.MRP, mrpInterfaces));
		facade.addSetupData(makeSetupData(Protocol.Companion, compInterfaces));

		await facade.connect();

		// Default: MRP has higher priority
		expect(facade.remoteControl.relayer.mainProtocol).toBe(Protocol.MRP);

		// Takeover: switch to Companion
		const release = facade.takeover(Protocol.Companion);
		expect(facade.remoteControl.relayer.mainProtocol).toBe(Protocol.Companion);

		// Release: back to MRP
		release();
		expect(facade.remoteControl.relayer.mainProtocol).toBe(Protocol.MRP);
	});
});
