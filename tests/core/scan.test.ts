/**
 * Tests for core/scan module.
 */

import { describe, expect, it } from "vitest";
import type { Response, Service } from "../../src/core/mdns.js";
import { getUniqueIdentifiers } from "../../src/core/scan.js";

const TEST_SERVICE1: Service = {
	type: "_service1._tcp.local",
	name: "service1",
	address: null,
	port: 0,
	properties: { a: "b" },
};

const TEST_SERVICE2: Service = {
	type: "_service2._tcp.local",
	name: "service2",
	address: null,
	port: 0,
	properties: { c: "d" },
};

describe("getUniqueIdentifiers", () => {
	it("returns empty for empty response", () => {
		const response: Response = {
			services: [],
			deepSleep: false,
			model: null,
		};
		expect([...getUniqueIdentifiers(response)]).toEqual([]);
	});

	it("returns identifiers from services", () => {
		const response: Response = {
			services: [
				{
					type: "_mediaremotetv._tcp.local",
					name: "test",
					address: "10.0.0.1",
					port: 49152,
					properties: { UniqueIdentifier: "mrp_id_1" },
				},
				{
					type: "_airplay._tcp.local",
					name: "test",
					address: "10.0.0.1",
					port: 7000,
					properties: { deviceid: "AA:BB:CC:DD:EE:FF" },
				},
			],
			deepSleep: false,
			model: null,
		};

		const ids = [...getUniqueIdentifiers(response)];
		expect(ids).toContain("mrp_id_1");
		expect(ids).toContain("AA:BB:CC:DD:EE:FF");
		expect(ids.length).toBe(2);
	});

	it("skips services without unique id", () => {
		const response: Response = {
			services: [TEST_SERVICE1, TEST_SERVICE2],
			deepSleep: false,
			model: null,
		};
		expect([...getUniqueIdentifiers(response)]).toEqual([]);
	});
});
