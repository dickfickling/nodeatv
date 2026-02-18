import { beforeEach, describe, expect, it } from "vitest";
import { AppleTV, ManualService } from "../src/conf.js";
import { Protocol } from "../src/const.js";
import { NoServiceError } from "../src/exceptions.js";
import { createSettings } from "../src/settings.js";

const ADDRESS_1 = "127.0.0.1";
const NAME = "Alice";
const PORT_1 = 1234;
const PORT_2 = 5678;
const PORT_3 = 1111;
const PORT_4 = 5555;
const IDENTIFIER_1 = "id1";
const IDENTIFIER_2 = "id2";
const IDENTIFIER_3 = "id3";
const IDENTIFIER_4 = "id4";
const PASSWORD_1 = "password1";

const DMAP_SERVICE = new ManualService(IDENTIFIER_1, Protocol.DMAP, PORT_1, {});
const MRP_SERVICE = new ManualService(IDENTIFIER_2, Protocol.MRP, PORT_2, {});
const AIRPLAY_SERVICE = new ManualService(
	IDENTIFIER_3,
	Protocol.AirPlay,
	PORT_1,
	{},
);
const COMPANION_SERVICE = new ManualService(
	null,
	Protocol.Companion,
	PORT_3,
	{},
);
const RAOP_SERVICE = new ManualService(IDENTIFIER_4, Protocol.RAOP, PORT_4, {});

describe("AppleTV config", () => {
	let config: AppleTV;

	beforeEach(() => {
		config = new AppleTV(ADDRESS_1, NAME, true);
	});

	it("address and name", () => {
		expect(config.address).toBe(ADDRESS_1);
		expect(config.name).toBe(NAME);
	});

	it("equality", () => {
		expect(config.equals(config)).toBe(true);

		const atv2 = new AppleTV(ADDRESS_1, NAME);
		atv2.addService(
			new ManualService(IDENTIFIER_1, Protocol.AirPlay, PORT_1, {}),
		);
		expect(config.equals(atv2)).toBe(false);
	});

	it("add services and get", () => {
		config.addService(DMAP_SERVICE);
		config.addService(MRP_SERVICE);
		config.addService(AIRPLAY_SERVICE);
		config.addService(COMPANION_SERVICE);
		config.addService(RAOP_SERVICE);

		const services = config.services;
		expect(services.length).toBe(5);

		expect(config.getService(Protocol.DMAP)).toBe(DMAP_SERVICE);
		expect(config.getService(Protocol.MRP)).toBe(MRP_SERVICE);
		expect(config.getService(Protocol.AirPlay)).toBe(AIRPLAY_SERVICE);
		expect(config.getService(Protocol.RAOP)).toBe(RAOP_SERVICE);
	});

	it("identifier order", () => {
		expect(config.identifier).toBeNull();

		config.addService(RAOP_SERVICE);
		expect(config.identifier).toBe(IDENTIFIER_4);

		config.addService(DMAP_SERVICE);
		expect(config.identifier).toBe(IDENTIFIER_1);

		config.addService(MRP_SERVICE);
		expect(config.identifier).toBe(IDENTIFIER_2);

		config.addService(AIRPLAY_SERVICE);
		expect(config.identifier).toBe(IDENTIFIER_2);
	});

	it("identifier missing for service", () => {
		config.addService(DMAP_SERVICE);
		config.addService(new ManualService(null, Protocol.MRP, 0, {}));

		expect(config.identifier).toBe(DMAP_SERVICE.identifier);
	});

	it("add airplay service", () => {
		config.addService(AIRPLAY_SERVICE);

		const airplay = config.getService(Protocol.AirPlay);
		expect(airplay.protocol).toBe(Protocol.AirPlay);
		expect(airplay.port).toBe(PORT_1);
	});

	it("main service no service throws", () => {
		expect(() => config.mainService()).toThrow(NoServiceError);
	});

	it("main service companion no service throws", () => {
		config.addService(COMPANION_SERVICE);
		expect(() => config.mainService()).toThrow(NoServiceError);
	});

	it("main service get service", () => {
		config.addService(RAOP_SERVICE);
		expect(config.mainService()).toBe(RAOP_SERVICE);

		config.addService(AIRPLAY_SERVICE);
		expect(config.mainService()).toBe(AIRPLAY_SERVICE);

		config.addService(DMAP_SERVICE);
		expect(config.mainService()).toBe(DMAP_SERVICE);

		config.addService(MRP_SERVICE);
		expect(config.mainService()).toBe(MRP_SERVICE);
	});

	it("main service override protocol", () => {
		config.addService(DMAP_SERVICE);
		config.addService(MRP_SERVICE);
		expect(config.mainService(DMAP_SERVICE.protocol)).toBe(DMAP_SERVICE);
	});

	it("set credentials for missing service", () => {
		expect(config.setCredentials(Protocol.DMAP, "dummy")).toBe(false);
	});

	it("set credentials", () => {
		config.addService(DMAP_SERVICE);
		expect(config.getService(Protocol.DMAP)?.credentials).toBeNull();

		config.setCredentials(Protocol.DMAP, "dummy");
		expect(config.getService(Protocol.DMAP)?.credentials).toBe("dummy");
	});

	it.each([
		[DMAP_SERVICE, true],
		[MRP_SERVICE, true],
		[AIRPLAY_SERVICE, true],
		[COMPANION_SERVICE, false],
		[RAOP_SERVICE, true],
	])("ready with %s service is %s", (service, expected) => {
		expect(config.ready).toBe(false);
		config.addService(service);
		expect(config.ready).toBe(expected);
	});

	it("to string", () => {
		config.addService(
			new ManualService(IDENTIFIER_1, Protocol.DMAP, 3689, {}, "LOGIN_ID"),
		);
		config.addService(
			new ManualService(IDENTIFIER_2, Protocol.MRP, PORT_2, {}),
		);

		const output = config.toString();
		expect(output).toContain(ADDRESS_1);
		expect(output).toContain(NAME);
		expect(output).toContain("LOGIN_ID");
		expect(output).toContain(String(PORT_2));
		expect(output).toContain("3689");
		expect(output).toContain("Deep Sleep: true");
	});

	it("str service disabled", () => {
		config.addService(
			new ManualService(
				IDENTIFIER_2,
				Protocol.MRP,
				PORT_2,
				{},
				null,
				null,
				false,
				undefined,
				false,
			),
		);

		expect(config.toString()).toContain("(Disabled)");
	});

	it("raop password in str", () => {
		config.addService(
			new ManualService(
				IDENTIFIER_1,
				Protocol.RAOP,
				1234,
				{},
				null,
				PASSWORD_1,
			),
		);

		expect(config.toString()).toContain(PASSWORD_1);
	});
});

describe("ManualService merge", () => {
	it.each([
		["pass1", null, "pass1"],
		[null, "pass2", "pass2"],
		["pass2", "pass1", "pass1"],
	] as [
		string | null,
		string | null,
		string,
	][])("merge password %s + %s = %s", (password1, password2, expected) => {
		const service1 = new ManualService("id1", Protocol.DMAP, 0, {});
		const service2 = new ManualService("id2", Protocol.DMAP, 0, {});
		service1.password = password1;
		service2.password = password2;
		service1.merge(service2);
		expect(service1.password).toBe(expected);
	});

	it.each([
		["creds1", null, "creds1"],
		[null, "creds2", "creds2"],
		["creds2", "creds1", "creds1"],
	] as [
		string | null,
		string | null,
		string,
	][])("merge credentials %s + %s = %s", (creds1, creds2, expected) => {
		const service1 = new ManualService("id1", Protocol.DMAP, 0, {});
		const service2 = new ManualService("id2", Protocol.DMAP, 0, {});
		service1.credentials = creds1;
		service2.credentials = creds2;
		service1.merge(service2);
		expect(service1.credentials).toBe(expected);
	});

	it.each([
		[{ foo: "bar" }, {}, { foo: "bar" }],
		[{}, { foo: "bar" }, { foo: "bar" }],
		[
			{ foo: "bar" },
			{ foo: "bar2", test: "dummy" },
			{ foo: "bar2", test: "dummy" },
		],
	] as [
		Record<string, string> | null,
		Record<string, string> | null,
		Record<string, string>,
	][])("merge properties", (props1, props2, expected) => {
		const service1 = new ManualService("id1", Protocol.DMAP, 0, props1);
		const service2 = new ManualService("id2", Protocol.DMAP, 0, props2);
		service1.merge(service2);
		expect(service1.properties).toEqual(expected);
	});
});

describe("ManualService settings", () => {
	it("get settings", () => {
		const service = new ManualService("id", Protocol.DMAP, 0, {});
		expect(service.settings()).toEqual({
			credentials: null,
			password: null,
		});

		service.credentials = "abc";
		expect(service.settings()).toEqual({
			credentials: "abc",
			password: null,
		});

		service.password = "def";
		expect(service.settings()).toEqual({
			credentials: "abc",
			password: "def",
		});
	});

	it("apply settings", () => {
		const service = new ManualService("id", Protocol.DMAP, 0, {});
		service.apply({ credentials: "creds", password: "password" });
		expect(service.credentials).toBe("creds");
		expect(service.password).toBe("password");
	});

	it("do not apply empty settings", () => {
		const service = new ManualService("id", Protocol.DMAP, 0, {});
		service.credentials = "creds";
		service.password = "password";
		service.apply({ credentials: null, password: null });
		expect(service.credentials).toBe("creds");
		expect(service.password).toBe("password");
	});
});

describe("config apply settings", () => {
	it("applies protocol settings to services", () => {
		const config = new AppleTV(ADDRESS_1, NAME);
		config.addService(DMAP_SERVICE);
		config.addService(MRP_SERVICE);
		config.addService(AIRPLAY_SERVICE);
		config.addService(COMPANION_SERVICE);
		config.addService(RAOP_SERVICE);

		const settings = createSettings();
		settings.protocols.airplay.credentials = "airplay";
		settings.protocols.companion.credentials = "companion";
		settings.protocols.dmap.credentials = "dmap";
		settings.protocols.mrp.credentials = "mrp";
		settings.protocols.raop.credentials = "raop";

		config.apply(settings);

		expect(config.getService(Protocol.AirPlay)?.credentials).toBe("airplay");
		expect(config.getService(Protocol.Companion)?.credentials).toBe(
			"companion",
		);
		expect(config.getService(Protocol.DMAP)?.credentials).toBe("dmap");
		expect(config.getService(Protocol.MRP)?.credentials).toBe("mrp");
		expect(config.getService(Protocol.RAOP)?.credentials).toBe("raop");
	});
});
