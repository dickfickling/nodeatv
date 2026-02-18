import { PairingRequirement, type Protocol } from "./const.js";
import { BaseConfig, BaseService, DeviceInfo } from "./interface.js";

export class AppleTV extends BaseConfig {
	private _address: string;
	private _name: string;
	private _deepSleep: boolean;
	private _services: Map<Protocol, BaseService>;
	private _deviceInfo: DeviceInfo;

	constructor(
		address: string,
		name: string,
		deepSleep = false,
		properties?: Record<string, Record<string, string>> | null,
		deviceInfo?: DeviceInfo | null,
	) {
		super(properties ?? {});
		this._address = address;
		this._name = name;
		this._deepSleep = deepSleep;
		this._services = new Map();
		this._deviceInfo = deviceInfo ?? new DeviceInfo({});
	}

	get address(): string {
		return this._address;
	}

	get name(): string {
		return this._name;
	}

	get deepSleep(): boolean {
		return this._deepSleep;
	}

	addService(service: BaseService): void {
		const existing = this._services.get(service.protocol);
		if (existing) {
			existing.merge(service);
		} else {
			this._services.set(service.protocol, service);
		}
	}

	getService(protocol: Protocol): BaseService | null {
		return this._services.get(protocol) ?? null;
	}

	get services(): BaseService[] {
		return [...this._services.values()];
	}

	get deviceInfo(): DeviceInfo {
		return this._deviceInfo;
	}

	deepCopy(): AppleTV {
		const copy = new AppleTV(
			this._address,
			this._name,
			this._deepSleep,
			this._properties,
			this._deviceInfo,
		);
		for (const service of this.services) {
			copy.addService(service.deepCopy());
		}
		return copy;
	}
}

export class ManualService extends BaseService {
	private _requiresPassword: boolean;
	private _pairingRequirement: PairingRequirement;

	constructor(
		identifier: string | null,
		protocol: Protocol,
		port: number,
		properties?: Record<string, string> | null,
		credentials?: string | null,
		password?: string | null,
		requiresPassword = false,
		pairingRequirement: PairingRequirement = PairingRequirement.Unsupported,
		enabled = true,
	) {
		super(
			identifier,
			protocol,
			port,
			properties,
			credentials,
			password,
			enabled,
		);
		this._requiresPassword = requiresPassword;
		this._pairingRequirement = pairingRequirement;
	}

	get requiresPassword(): boolean {
		return this._requiresPassword;
	}

	get pairing(): PairingRequirement {
		return this._pairingRequirement;
	}

	deepCopy(): ManualService {
		return new ManualService(
			this.identifier,
			this.protocol,
			this.port,
			{ ...this.properties },
			this.credentials,
			this.password,
			this.requiresPassword,
			this.pairing,
			this.enabled,
		);
	}
}
