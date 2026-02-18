import { describe, expect, it } from "vitest";
import { Protocol } from "../../src/const.js";
import { PROTOCOLS, type ProtocolMethods } from "../../src/protocols/index.js";

describe("PROTOCOLS registry", () => {
	it("has all five protocols registered", () => {
		expect(PROTOCOLS.size).toBe(5);
		expect(PROTOCOLS.has(Protocol.DMAP)).toBe(true);
		expect(PROTOCOLS.has(Protocol.MRP)).toBe(true);
		expect(PROTOCOLS.has(Protocol.Companion)).toBe(true);
		expect(PROTOCOLS.has(Protocol.AirPlay)).toBe(true);
		expect(PROTOCOLS.has(Protocol.RAOP)).toBe(true);
	});

	for (const [protocol, name] of [
		[Protocol.DMAP, "DMAP"],
		[Protocol.MRP, "MRP"],
		[Protocol.Companion, "Companion"],
		[Protocol.AirPlay, "AirPlay"],
		[Protocol.RAOP, "RAOP"],
	] as [Protocol, string][]) {
		describe(`${name} protocol methods`, () => {
			it("has scan function", () => {
				const methods = PROTOCOLS.get(protocol) as ProtocolMethods;
				expect(typeof methods.scan).toBe("function");
			});

			it("has setup function", () => {
				const methods = PROTOCOLS.get(protocol) as ProtocolMethods;
				expect(typeof methods.setup).toBe("function");
			});

			it("has pair function", () => {
				const methods = PROTOCOLS.get(protocol) as ProtocolMethods;
				expect(typeof methods.pair).toBe("function");
			});

			it("scan returns an object", () => {
				const methods = PROTOCOLS.get(protocol) as ProtocolMethods;
				const result = methods.scan();
				expect(typeof result).toBe("object");
			});
		});
	}

	it("DMAP has deviceInfo and serviceInfo", () => {
		const methods = PROTOCOLS.get(Protocol.DMAP) as ProtocolMethods;
		expect(typeof methods.deviceInfo).toBe("function");
		expect(typeof methods.serviceInfo).toBe("function");
	});

	it("MRP has deviceInfo and serviceInfo", () => {
		const methods = PROTOCOLS.get(Protocol.MRP) as ProtocolMethods;
		expect(typeof methods.deviceInfo).toBe("function");
		expect(typeof methods.serviceInfo).toBe("function");
	});

	it("Companion has deviceInfo and serviceInfo", () => {
		const methods = PROTOCOLS.get(Protocol.Companion) as ProtocolMethods;
		expect(typeof methods.deviceInfo).toBe("function");
		expect(typeof methods.serviceInfo).toBe("function");
	});

	it("AirPlay has deviceInfo and serviceInfo", () => {
		const methods = PROTOCOLS.get(Protocol.AirPlay) as ProtocolMethods;
		expect(typeof methods.deviceInfo).toBe("function");
		expect(typeof methods.serviceInfo).toBe("function");
	});

	it("RAOP has deviceInfo and serviceInfo", () => {
		const methods = PROTOCOLS.get(Protocol.RAOP) as ProtocolMethods;
		expect(typeof methods.deviceInfo).toBe("function");
		expect(typeof methods.serviceInfo).toBe("function");
	});
});
