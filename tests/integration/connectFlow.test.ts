/**
 * Integration test: Top-level pair() function creates correct pairing handlers.
 */

import { describe, expect, it } from "vitest";
import { Protocol } from "../../src/const.js";
import { AppleTV } from "../../src/conf.js";
import { MutableService } from "../../src/core/core.js";
import { pair } from "../../src/orchestration.js";
import { MrpPairingHandler } from "../../src/protocols/mrp/pairing.js";
import { CompanionPairingHandler } from "../../src/protocols/companion/pairing.js";
import { AirPlayPairingHandler } from "../../src/protocols/airplay/index.js";

function createConfig(protocol: Protocol, port: number): AppleTV {
	const config = new AppleTV("192.168.1.1", "TestDevice");
	const service = new MutableService(null, protocol, port, {});
	config.addService(service);
	return config;
}

describe("pair() orchestration", () => {
	it("creates MrpPairingHandler for MRP protocol", async () => {
		const config = createConfig(Protocol.MRP, 49152);
		const handler = await pair(config, Protocol.MRP);
		expect(handler).toBeInstanceOf(MrpPairingHandler);
	});

	it("creates CompanionPairingHandler for Companion protocol", async () => {
		const config = createConfig(Protocol.Companion, 49153);
		const handler = await pair(config, Protocol.Companion);
		expect(handler).toBeInstanceOf(CompanionPairingHandler);
	});

	it("creates AirPlayPairingHandler for AirPlay protocol", async () => {
		const config = createConfig(Protocol.AirPlay, 7000);
		const handler = await pair(config, Protocol.AirPlay);
		expect(handler).toBeInstanceOf(AirPlayPairingHandler);
	});

	it("throws for missing service", async () => {
		const config = new AppleTV("192.168.1.1", "TestDevice");
		await expect(pair(config, Protocol.MRP)).rejects.toThrow(
			"no service for protocol",
		);
	});
});
