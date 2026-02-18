/**
 * Implementation of device scanning routines.
 * Only mDNS-based scanners (no zeroconf dependency).
 */

import { AppleTV } from "../conf.js";
import { DeviceModel, type Protocol } from "../const.js";
import { getUniqueId } from "../helpers.js";
import { type BaseConfig, type BaseService, DeviceInfo } from "../interface.js";
import { lookupInternalName } from "../support/deviceInfo.js";
import { knocker } from "../support/knock.js";
import type { MutableService } from "./core.js";
import * as mdns from "./mdns.js";

// --- Type aliases ---

export type ScanHandlerReturn = [string, MutableService];
export type ScanHandler = (
	service: mdns.Service,
	response: mdns.Response,
) => ScanHandlerReturn | null;
export type DeviceInfoNameFromShortName = (
	serviceName: string,
) => string | null;
export type ScanHandlerDeviceInfoName = [
	ScanHandler,
	DeviceInfoNameFromShortName,
];
export type ScanMethod = () => Record<string, ScanHandlerDeviceInfoName>;
export type DevInfoExtractor = (
	serviceType: string,
	properties: Record<string, unknown>,
) => Record<string, unknown>;
export type ServiceInfoMethod = (
	service: MutableService,
	deviceInfo: DeviceInfo,
	properties: Map<Protocol, BaseService>,
) => Promise<void>;

// --- Constants ---

const DEVICE_INFO = "_device-info._tcp.local";
const SLEEP_PROXY = "_sleep-proxy._udp.local";

/** Ports used for best-effort wake-up knocking during unicast scanning. */
const KNOCK_PORTS = [3689, 7000, 49152, 32498];

// --- FoundDevice ---

export interface FoundDevice {
	name: string;
	address: string;
	deepSleep: boolean;
	model: DeviceModel;
	services: MutableService[];
}

// --- Helper functions ---

export function deviceInfoNameFromUniqueShortName(serviceName: string): string {
	return serviceName;
}

function sleepProxyDeviceInfoNameFromShortName(serviceName: string): string {
	return serviceName.split(" ").slice(1).join(" ");
}

export function* getUniqueIdentifiers(
	response: mdns.Response,
): Generator<string> {
	for (const service of response.services) {
		const uniqueId = getUniqueId(
			service.type,
			service.name,
			service.properties,
		);
		if (uniqueId) {
			yield uniqueId;
		}
	}
}

function emptyHandler(_service: mdns.Service, _response: mdns.Response): null {
	return null;
}

function emptyExtractor(
	_serviceType: string,
	_properties: Record<string, unknown>,
): Record<string, unknown> {
	return {};
}

// --- BaseScanner ---

export abstract class BaseScanner {
	protected _services: Map<string, [ScanHandler, DevInfoExtractor]> = new Map([
		[DEVICE_INFO, [emptyHandler, emptyExtractor]],
		[SLEEP_PROXY, [emptyHandler, emptyExtractor]],
	]);
	protected _deviceInfoName: Map<string, (name: string) => string | null> =
		new Map([[SLEEP_PROXY, sleepProxyDeviceInfoNameFromShortName]]);
	protected _serviceInfos: Map<Protocol, ServiceInfoMethod> = new Map();
	protected _foundDevices: Map<string, FoundDevice> = new Map();
	protected _properties: Map<string, Record<string, Record<string, string>>> =
		new Map();

	addService(
		serviceType: string,
		handlerDeviceInfoName: ScanHandlerDeviceInfoName,
		deviceInfoExtractor: DevInfoExtractor,
	): void {
		const [handler, deviceInfoName] = handlerDeviceInfoName;
		this._deviceInfoName.set(serviceType, deviceInfoName);
		this._services.set(serviceType, [handler, deviceInfoExtractor]);
	}

	addServiceInfo(protocol: Protocol, serviceInfo: ServiceInfoMethod): void {
		this._serviceInfos.set(protocol, serviceInfo);
	}

	get services(): string[] {
		return [...this._services.keys()];
	}

	async discover(timeout: number): Promise<Map<string, BaseConfig>> {
		await this.process(timeout);

		const devices = new Map<string, BaseConfig>();
		for (const [address, foundDevice] of this._foundDevices) {
			const deviceInfo = this._getDeviceInfo(foundDevice);

			const properties = this._properties.get(address) ?? {};
			const atv = new AppleTV(
				address,
				foundDevice.name,
				foundDevice.deepSleep,
				properties,
				deviceInfo,
			);

			for (const service of foundDevice.services) {
				atv.addService(service);
			}

			const propertiesMap = new Map<Protocol, BaseService>();
			for (const service of atv.services) {
				propertiesMap.set(service.protocol, service);
			}

			for (const deviceService of atv.services) {
				const infoMethod = this._serviceInfos.get(deviceService.protocol);
				if (infoMethod) {
					await infoMethod(
						deviceService as MutableService,
						deviceInfo,
						propertiesMap,
					);
				}
			}

			devices.set(address, atv);
		}

		return devices;
	}

	abstract process(timeout: number): Promise<void>;

	handleResponse(response: mdns.Response): void {
		for (const service of response.services) {
			if (!this._services.has(service.type)) {
				continue;
			}
			try {
				this._serviceDiscovered(service, response);
			} catch {
				// Failed to parse service, skip
			}
		}
	}

	private _serviceDiscovered(
		service: mdns.Service,
		response: mdns.Response,
	): void {
		if (service.address === null || service.port === 0) {
			return;
		}

		const serviceDef = this._services.get(service.type);
		if (!serviceDef) return;

		const result = serviceDef[0](service, response);
		if (result) {
			const [name, baseService] = result;

			if (!this._foundDevices.has(service.address)) {
				this._foundDevices.set(service.address, {
					name,
					address: service.address,
					deepSleep: response.deepSleep,
					model: lookupInternalName(response.model),
					services: [],
				});
			}
			this._foundDevices.get(service.address)!.services.push(baseService);
		}

		// Save properties for all services belonging to a device/address
		if (service.address !== null) {
			if (!this._properties.has(service.address)) {
				this._properties.set(service.address, {});
			}
			this._properties.get(service.address)![service.type] = service.properties;
		}
	}

	private _getDeviceInfo(device: FoundDevice): DeviceInfo {
		const deviceInfoData: Record<string, unknown> = {};

		const deviceProperties = this._properties.get(device.address) ?? {};
		for (const [serviceName, serviceProperties] of Object.entries(
			deviceProperties,
		)) {
			const serviceInfo = this._services.get(serviceName);
			if (serviceInfo) {
				const [, extractor] = serviceInfo;
				const extracted = extractor(serviceName, serviceProperties);
				Object.assign(deviceInfoData, extracted);
			}
		}

		if (device.model !== DeviceModel.Unknown) {
			deviceInfoData[DeviceInfo.MODEL] = device.model;
		}

		return new DeviceInfo(deviceInfoData);
	}
}

// --- UnicastMdnsScanner ---

export class UnicastMdnsScanner extends BaseScanner {
	hosts: string[];

	constructor(hosts: string[]) {
		super();
		this.hosts = hosts;
	}

	async process(timeout: number): Promise<void> {
		const responses = await Promise.all(
			this.hosts.map((host) => this._getServices(host, timeout)),
		);

		for (const response of responses) {
			this.handleResponse(response);
		}
	}

	private async _getServices(
		host: string,
		timeout: number,
	): Promise<mdns.Response> {
		const port = Number.parseInt(process.env.NODEATV_UDNS_PORT ?? "5353", 10);
		try {
			// Fire-and-forget knock to wake sleeping devices
			knocker(host, KNOCK_PORTS, timeout);
			return await mdns.unicast(host, this.services, port, timeout);
		} catch {
			return { services: [], deepSleep: false, model: null };
		}
	}
}

// --- MulticastMdnsScanner ---

export class MulticastMdnsScanner extends BaseScanner {
	identifier: Set<string> | null;

	constructor(identifier?: string | Set<string> | null) {
		super();
		if (typeof identifier === "string") {
			this.identifier = new Set([identifier]);
		} else {
			this.identifier = identifier ?? null;
		}
	}

	async process(timeout: number): Promise<void> {
		const responses = await mdns.multicast(
			this.services,
			undefined,
			undefined,
			timeout,
			this.identifier
				? (response) => this._endIfIdentifierFound(response)
				: undefined,
		);
		for (const response of responses) {
			this.handleResponse(response);
		}
	}

	private _endIfIdentifierFound(response: mdns.Response): boolean {
		if (!this.identifier) return false;
		const ids = new Set(getUniqueIdentifiers(response));
		// Check if there's any intersection
		for (const id of this.identifier) {
			if (ids.has(id)) return true;
		}
		return false;
	}
}
