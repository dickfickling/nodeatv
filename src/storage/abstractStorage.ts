import { createHash } from "node:crypto";
import { Protocol } from "../const.js";
import { DeviceIdMissingError, SettingsError } from "../exceptions.js";
import type { BaseConfig } from "../interface.js";
import { createSettings, type Settings } from "../settings.js";

export const MODEL_VERSION = 1;

function dictHash(data: Record<string, unknown>): string {
	const hasher = createHash("sha256");
	hasher.update(JSON.stringify(data), "utf-8");
	return hasher.digest("hex");
}

export interface StorageModel {
	version: number;
	devices: Settings[];
}

export abstract class AbstractStorage {
	protected _settings: Settings[] = [];
	private _hash: string;

	constructor() {
		this._hash = dictHash({});
	}

	hasChanged(data: Record<string, unknown>): boolean {
		return this._hash !== dictHash(data);
	}

	get settings(): Settings[] {
		return this._settings;
	}

	get storageModel(): StorageModel {
		return { version: MODEL_VERSION, devices: this._settings };
	}

	set storageModel(other: StorageModel) {
		if (other.version !== MODEL_VERSION) {
			throw new SettingsError(`unsupported version: ${other.version}`);
		}
		this._settings = other.devices;
	}

	updateHash(data: Record<string, unknown>): void {
		this._hash = dictHash(data);
	}

	async getSettings(config: BaseConfig): Promise<Settings> {
		const identifiers = config.allIdentifiers;
		if (identifiers.length === 0) {
			throw new DeviceIdMissingError(`no identifier for device ${config.name}`);
		}

		for (const settings of this._settings) {
			if (
				(settings.protocols.airplay.identifier !== null &&
					identifiers.includes(settings.protocols.airplay.identifier)) ||
				(settings.protocols.companion.identifier !== null &&
					identifiers.includes(settings.protocols.companion.identifier)) ||
				(settings.protocols.dmap.identifier !== null &&
					identifiers.includes(settings.protocols.dmap.identifier)) ||
				(settings.protocols.mrp.identifier !== null &&
					identifiers.includes(settings.protocols.mrp.identifier)) ||
				(settings.protocols.raop.identifier !== null &&
					identifiers.includes(settings.protocols.raop.identifier))
			) {
				return settings;
			}
		}

		const settings = createSettings();
		this._updateSettingsFromConfig(config, settings);
		this._settings.push(settings);
		return settings;
	}

	async removeSettings(settings: Settings): Promise<boolean> {
		const index = this._settings.indexOf(settings);
		if (index !== -1) {
			this._settings.splice(index, 1);
			return true;
		}
		return false;
	}

	async updateSettings(config: BaseConfig): Promise<void> {
		const settings = await this.getSettings(config);
		this._updateSettingsFromConfig(config, settings);
	}

	private _updateSettingsFromConfig(
		config: BaseConfig,
		settings: Settings,
	): void {
		for (const service of config.services) {
			const serviceSettings = service.settings();
			if (service.protocol === Protocol.AirPlay) {
				Object.assign(settings.protocols.airplay, serviceSettings);
				settings.protocols.airplay.identifier = service.identifier;
			} else if (service.protocol === Protocol.DMAP) {
				Object.assign(settings.protocols.dmap, serviceSettings);
				settings.protocols.dmap.identifier = service.identifier;
			} else if (service.protocol === Protocol.Companion) {
				Object.assign(settings.protocols.companion, serviceSettings);
				settings.protocols.companion.identifier = service.identifier;
			} else if (service.protocol === Protocol.MRP) {
				Object.assign(settings.protocols.mrp, serviceSettings);
				settings.protocols.mrp.identifier = service.identifier;
			}
			if (service.protocol === Protocol.RAOP) {
				Object.assign(settings.protocols.raop, serviceSettings);
				settings.protocols.raop.identifier = service.identifier;
			}
		}
	}

	toJSON(): Record<string, unknown> {
		const dumped: Record<string, unknown> = {
			version: MODEL_VERSION,
			devices: this._settings.filter((s) => Object.keys(s).length > 0),
		};
		return dumped;
	}

	abstract save(): Promise<void>;
	abstract load(): Promise<void>;
}
