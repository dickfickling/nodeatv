import { beforeEach, describe, expect, it } from "vitest";
import { AppleTV, ManualService } from "../../src/conf.js";
import { Protocol } from "../../src/const.js";
import { DeviceIdMissingError, SettingsError } from "../../src/exceptions.js";
import { MemoryStorage } from "../../src/storage/memoryStorage.js";

describe("MemoryStorage", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	it("load and save does nothing special", async () => {
		await storage.load();
		await storage.save();
	});

	it("get settings without identifier raises", async () => {
		const atv = new AppleTV("127.0.0.1", "test");
		await expect(storage.getSettings(atv)).rejects.toThrow(
			DeviceIdMissingError,
		);
	});

	it.each([
		[Protocol.AirPlay, true, "airplay"],
		[Protocol.Companion, false, "companion"],
		[Protocol.DMAP, false, "dmap"],
		[Protocol.MRP, false, "mrp"],
		[Protocol.RAOP, true, "raop"],
	] as [
		Protocol,
		boolean,
		string,
	][])("get settings for device with protocol %s", async (protocol, hasPassword, settingName) => {
		const atv = new AppleTV("127.0.0.1", "test");
		atv.addService(
			new ManualService(
				"id",
				protocol,
				1234,
				{},
				"creds",
				hasPassword ? "password" : null,
			),
		);

		const settings = await storage.getSettings(atv);

		expect(settings.info.name).toBe("nodeatv");
		const protoSettings = settings.protocols[
			settingName as keyof typeof settings.protocols
		] as Record<string, unknown>;
		expect(protoSettings.identifier).toBe("id");
		expect(protoSettings.credentials).toBe("creds");
		if (hasPassword) {
			expect(protoSettings.password).toBe("password");
		}
	});

	it("adding same config returns existing settings", async () => {
		expect(storage.settings.length).toBe(0);

		const atv = new AppleTV("127.0.0.1", "test");
		atv.addService(new ManualService("id", Protocol.DMAP, 1234, {}));

		await storage.getSettings(atv);
		expect(storage.settings.length).toBe(1);

		await storage.getSettings(atv);
		expect(storage.settings.length).toBe(1);
	});

	it("get all settings", async () => {
		const atv = new AppleTV("127.0.0.1", "test");
		atv.addService(new ManualService("id1", Protocol.DMAP, 1234, {}));
		const settings = await storage.getSettings(atv);

		const atv2 = new AppleTV("127.0.0.1", "test");
		atv2.addService(new ManualService("id2", Protocol.DMAP, 1234, {}));
		const settings2 = await storage.getSettings(atv2);

		expect(storage.settings.length).toBe(2);
		expect(storage.settings).toContain(settings);
		expect(storage.settings).toContain(settings2);
	});

	it("remove settings", async () => {
		const atv = new AppleTV("127.0.0.1", "test");
		atv.addService(new ManualService("id", Protocol.DMAP, 1234, {}));

		const settings = await storage.getSettings(atv);
		expect(storage.settings.length).toBe(1);

		expect(await storage.removeSettings(settings)).toBe(true);
		expect(storage.settings.length).toBe(0);

		expect(await storage.removeSettings(settings)).toBe(false);
	});

	it.each([
		Protocol.AirPlay,
		Protocol.Companion,
		Protocol.MRP,
		Protocol.RAOP,
	])("settings prioritized over config for %s", async (protocol) => {
		const atv = new AppleTV("127.0.0.1", "test");
		const dmapService = new ManualService("id1", Protocol.DMAP, 1234, {});
		const otherService = new ManualService("id2", protocol, 1234, {}, "creds");
		atv.addService(dmapService);
		atv.addService(otherService);

		// Load settings once to insert initial settings
		let settings = await storage.getSettings(atv);

		// Change something and read from storage again
		dmapService.credentials = "dmap_creds";
		settings = await storage.getSettings(atv);

		expect(settings.protocols.dmap.credentials).toBeNull();
		const protoName = Protocol[protocol].toLowerCase();
		const protoSettings = settings.protocols[
			protoName as keyof typeof settings.protocols
		] as Record<string, unknown>;
		expect(protoSettings.identifier).toBe("id2");
		expect(protoSettings.credentials).toBe("creds");
	});

	it.each([
		Protocol.DMAP,
		Protocol.MRP,
		Protocol.AirPlay,
		Protocol.Companion,
		Protocol.RAOP,
	])("update config changes to storage for %s", async (protocol) => {
		const atv = new AppleTV("127.0.0.1", "test");
		const service = new ManualService("id2", protocol, 1234, {}, "test");
		atv.addService(service);

		let settings = await storage.getSettings(atv);
		const protoName = Protocol[protocol].toLowerCase();
		let protoSettings = settings.protocols[
			protoName as keyof typeof settings.protocols
		] as Record<string, unknown>;
		expect(protoSettings.credentials).toBe("test");

		// Update credentials and write changes back to storage
		service.credentials = "foobar";
		await storage.updateSettings(atv);

		// Verify settings were written
		settings = await storage.getSettings(atv);
		protoSettings = settings.protocols[
			protoName as keyof typeof settings.protocols
		] as Record<string, unknown>;
		expect(protoSettings.credentials).toBe("foobar");
	});

	it("change info is device dependent", async () => {
		const atv = new AppleTV("127.0.0.1", "test");
		atv.addService(new ManualService("id1", Protocol.DMAP, 1234, {}));
		const settings = await storage.getSettings(atv);
		settings.info.name = "first";

		const atv2 = new AppleTV("127.0.0.1", "test");
		atv2.addService(new ManualService("id2", Protocol.DMAP, 1234, {}));
		const settings2 = await storage.getSettings(atv2);
		settings2.info.name = "second";

		const reloaded = await storage.getSettings(atv);
		expect(reloaded.info.name).toBe("first");
	});

	it("unsupported version raises", () => {
		expect(() => {
			storage.storageModel = { version: 2, devices: [] };
		}).toThrow(SettingsError);
	});

	it("change field reflected in changed property", async () => {
		expect(storage.hasChanged(storage.toJSON())).toBe(true);
		storage.updateHash(storage.toJSON());
		expect(storage.hasChanged(storage.toJSON())).toBe(false);

		const atv = new AppleTV("127.0.0.1", "test");
		atv.addService(new ManualService("id1", Protocol.DMAP, 1234, {}));
		const settings = await storage.getSettings(atv);

		expect(storage.hasChanged(storage.toJSON())).toBe(true);
		storage.updateHash(storage.toJSON());

		settings.info.name = "test";
		expect(storage.hasChanged(storage.toJSON())).toBe(true);
		storage.updateHash(storage.toJSON());
		expect(storage.hasChanged(storage.toJSON())).toBe(false);
	});

	it("set model reflects changed property", async () => {
		const atv = new AppleTV("127.0.0.1", "test");
		atv.addService(new ManualService("id1", Protocol.DMAP, 1234, {}));
		await storage.getSettings(atv);

		const newStorage = new MemoryStorage();
		newStorage.updateHash(newStorage.toJSON());

		newStorage.storageModel = storage.storageModel;
		expect(newStorage.hasChanged(newStorage.toJSON())).toBe(true);

		newStorage.updateHash(newStorage.toJSON());
		expect(newStorage.hasChanged(newStorage.toJSON())).toBe(false);
	});

	it("save updates changed property", async () => {
		const atv = new AppleTV("127.0.0.1", "test");
		atv.addService(new ManualService("id1", Protocol.DMAP, 1234, {}));
		await storage.getSettings(atv);

		expect(storage.hasChanged(storage.toJSON())).toBe(true);
		await storage.save();
		expect(storage.hasChanged(storage.toJSON())).toBe(false);
	});
});
