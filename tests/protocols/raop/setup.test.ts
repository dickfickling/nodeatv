import { afterEach, describe, expect, it, vi } from "vitest";
import { AirPlayMajorVersion } from "../../../src/protocols/airplay/utils.js";
import { AirPlayVersion } from "../../../src/settings.js";
import { RaopPlaybackManager } from "../../../src/protocols/raop/index.js";

// Mock httpConnect to avoid real network connections
vi.mock("../../../src/support/http.js", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		httpConnect: vi.fn().mockResolvedValue({
			socket: {},
			localAddress: "192.168.1.10",
			remoteAddress: "192.168.1.20",
			close: vi.fn(),
			sendAndReceive: vi.fn(),
			_connectionMade: vi.fn(),
			_dataReceived: vi.fn(),
			_connectionLost: vi.fn(),
		}),
	};
});

// Mock RtspSession to avoid real RTSP traffic
vi.mock("../../../src/support/rtsp.js", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	class MockRtspSession {
		connection = {};
		sessionId = 12345;
		dacpId = "test";
		activeRemote = 0;
		cseq = 0;
		announce = vi.fn().mockResolvedValue(undefined);
		setup = vi.fn().mockResolvedValue({ headers: {} });
		record = vi.fn().mockResolvedValue(undefined);
		setParameter = vi.fn().mockResolvedValue(undefined);
		sendAndReceive = vi.fn().mockResolvedValue({});
	}
	return {
		...actual,
		RtspSession: MockRtspSession,
	};
});

// Mock StreamClient to avoid UDP sockets and real initialization
vi.mock("../../../src/protocols/raop/streamClient.js", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	class MockStreamClient {
		initialize = vi.fn().mockResolvedValue(undefined);
		close = vi.fn();
		stop = vi.fn();
		setVolume = vi.fn();
	}
	return {
		...actual,
		StreamClient: MockStreamClient,
	};
});

// Track protocol construction
let airplayV1Constructed = false;
let airplayV2Constructed = false;

// Mock AirPlay protocol classes
vi.mock("../../../src/protocols/raop/protocols/airplayv1.js", () => {
	class MockAirPlayV1 {
		setup = vi.fn().mockResolvedValue(undefined);
		teardown = vi.fn();
		constructor() {
			airplayV1Constructed = true;
		}
	}
	return { AirPlayV1: MockAirPlayV1 };
});

vi.mock("../../../src/protocols/raop/protocols/airplayv2.js", () => {
	class MockAirPlayV2 {
		setup = vi.fn().mockResolvedValue(undefined);
		teardown = vi.fn();
		constructor() {
			airplayV2Constructed = true;
		}
	}
	return { AirPlayV2: MockAirPlayV2 };
});

function createMockCore() {
	return {
		config: { address: "192.168.1.20", properties: {} },
		service: { port: 7000, properties: {}, credentials: null },
		settings: {
			info: { name: "Test" },
			protocols: {
				raop: {
					protocolVersion: AirPlayVersion.Auto,
					timingPort: 0,
					controlPort: 0,
					credentials: null,
					password: null,
				},
			},
		},
		stateDispatcher: {
			listenTo: () => {},
			dispatch: () => [],
		},
	} as unknown as import("../../../src/core/core.js").Core;
}

function createMockService(properties: Record<string, string> = {}) {
	return {
		port: 7000,
		properties,
		credentials: null,
		password: null,
		identifier: "test-id",
	} as unknown as import("../../../src/interface.js").BaseService;
}

describe("RaopPlaybackManager.setup()", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("creates connection and StreamClient", async () => {
		const core = createMockCore();
		const pm = new RaopPlaybackManager(core);
		const service = createMockService();

		const [streamClient, context] = await pm.setup(service);

		expect(streamClient).toBeDefined();
		expect(context).toBeDefined();
		expect(streamClient.initialize).toHaveBeenCalledWith(service.properties);
	});

	it("returns existing client on second call", async () => {
		const core = createMockCore();
		const pm = new RaopPlaybackManager(core);
		const service = createMockService();

		const [first] = await pm.setup(service);
		const [second] = await pm.setup(service);

		expect(first).toBe(second);
	});

	it("picks AirPlayV1 for devices without V2 features", async () => {
		airplayV1Constructed = false;
		airplayV2Constructed = false;

		const core = createMockCore();
		const pm = new RaopPlaybackManager(core);
		const service = createMockService({ ft: "0x0" });

		await pm.setup(service);

		expect(airplayV1Constructed).toBe(true);
		expect(airplayV2Constructed).toBe(false);
	});

	it("picks AirPlayV2 for devices with V2 features", async () => {
		airplayV1Constructed = false;
		airplayV2Constructed = false;

		const core = createMockCore();
		const pm = new RaopPlaybackManager(core);
		// Bit 38 = SupportsUnifiedMediaControl = 0x40,0x00000000
		const service = createMockService({ ft: "0x00000000,0x40" });

		await pm.setup(service);

		expect(airplayV2Constructed).toBe(true);
		expect(airplayV1Constructed).toBe(false);
	});

	it("sets credentials from service on context", async () => {
		const core = createMockCore();
		const pm = new RaopPlaybackManager(core);
		const service = createMockService();
		(service as { credentials: string | null }).credentials = "test-cred";
		(service as { password: string | null }).password = "test-pass";

		const [, context] = await pm.setup(service);

		expect(context.credentials).toBe("test-cred");
		expect(context.password).toBe("test-pass");
	});
});

describe("RaopPlaybackManager.teardown()", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("closes connection and stream client", async () => {
		const core = createMockCore();
		const pm = new RaopPlaybackManager(core);
		const service = createMockService();

		const [streamClient] = await pm.setup(service);

		await pm.teardown();

		expect(streamClient.close).toHaveBeenCalled();
		expect(pm.streamClient).toBeNull();
	});

	it("resets acquired state", async () => {
		const core = createMockCore();
		const pm = new RaopPlaybackManager(core);
		const service = createMockService();

		pm.acquire();
		await pm.setup(service);
		await pm.teardown();

		// Should be able to acquire again without error
		expect(() => pm.acquire()).not.toThrow();
	});
});

describe("setup() generator close", () => {
	it("close returns set with teardown promise", async () => {
		// Import the setup generator
		const { setup } = await import("../../../src/protocols/raop/index.js");
		const core = createMockCore();

		const gen = setup(core);
		const result = gen.next();
		const setupData = result.value;

		expect(setupData).toBeDefined();

		// close should return a Set of promises
		const promises = setupData!.close();
		expect(promises).toBeInstanceOf(Set);
		expect(promises.size).toBe(1);

		// Wait for all promises to resolve
		await Promise.all(promises);
	});
});
