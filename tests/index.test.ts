import { describe, expect, it } from "vitest";
import { AppleTV, ManualService } from "../src/conf.js";
import { Protocol } from "../src/const.js";
import { connect, pair, scan } from "../src/orchestration.js";

describe("scan", () => {
	it("returns an array", async () => {
		// Scan with very short timeout to avoid hanging, and use a non-routable host
		const results = await scan({ timeout: 0.01, hosts: [] });
		expect(Array.isArray(results)).toBe(true);
	});

	it("accepts protocol filter", async () => {
		const results = await scan({
			timeout: 0.01,
			hosts: [],
			protocol: Protocol.MRP,
		});
		expect(Array.isArray(results)).toBe(true);
	});

	it("accepts identifier filter", async () => {
		const results = await scan({
			timeout: 0.01,
			hosts: [],
			identifier: "test-id",
		});
		expect(Array.isArray(results)).toBe(true);
	});

	it("accepts Set-based filters", async () => {
		const results = await scan({
			timeout: 0.01,
			hosts: [],
			protocol: new Set([Protocol.MRP, Protocol.AirPlay]),
			identifier: new Set(["id1", "id2"]),
		});
		expect(Array.isArray(results)).toBe(true);
	});
});

describe("connect", () => {
	it("throws when config has no services", async () => {
		const config = new AppleTV("192.168.1.1", "Test");
		await expect(connect(config)).rejects.toThrow("no services");
	});

	it("rejects when device is unreachable", async () => {
		const config = new AppleTV("192.168.1.1", "Test");
		const service = new ManualService("test-id", Protocol.DMAP, 3689);
		service.credentials = "0x0000000000001234";
		config.addService(service);

		// connect() will try to actually connect to the device, which will fail
		await expect(connect(config)).rejects.toThrow();
	});
});

describe("pair", () => {
	it("throws when no service for protocol", async () => {
		const config = new AppleTV("192.168.1.1", "Test");
		await expect(pair(config, Protocol.MRP)).rejects.toThrow(
			"no service for protocol",
		);
	});

	it("creates pairing handler for DMAP", async () => {
		const config = new AppleTV("192.168.1.1", "Test");
		config.addService(new ManualService("test-id", Protocol.DMAP, 3689));

		const handler = await pair(config, Protocol.DMAP);
		expect(handler).toBeTruthy();
	});
});
