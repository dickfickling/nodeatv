import { PairingRequirement } from "./const.js";
import type { BaseConfig } from "./interface.js";

export const HOMESHARING_SERVICE = "_appletv-v2._tcp.local";
export const DEVICE_SERVICE = "_touch-able._tcp.local";
export const MEDIAREMOTE_SERVICE = "_mediaremotetv._tcp.local";
export const AIRPLAY_SERVICE = "_airplay._tcp.local";
export const COMPANION_SERVICE = "_companion-link._tcp.local";
export const RAOP_SERVICE = "_raop._tcp.local";
export const HSCP_SERVICE = "_hscp._tcp.local";

export function getUniqueId(
	serviceType: string,
	serviceName: string,
	properties: Record<string, string>,
): string | null {
	if (serviceType === DEVICE_SERVICE || serviceType === HOMESHARING_SERVICE) {
		return serviceName.split("_")[0];
	}
	if (serviceType === HSCP_SERVICE) {
		return properties["Machine ID"] ?? null;
	}
	if (serviceType === MEDIAREMOTE_SERVICE) {
		return properties.UniqueIdentifier ?? null;
	}
	if (serviceType === AIRPLAY_SERVICE) {
		return properties.deviceid ?? null;
	}
	if (serviceType === COMPANION_SERVICE) {
		return properties.rpmrtid ?? null;
	}
	if (serviceType === RAOP_SERVICE) {
		const split = serviceName.split("@", 2);
		if (split.length === 2) {
			return split[0];
		}
		return properties.pk ?? null;
	}
	return null;
}

export function isDeviceSupported(conf: BaseConfig): boolean {
	const requirements = new Set(conf.services.map((s) => s.pairing));
	requirements.delete(PairingRequirement.Unsupported);
	requirements.delete(PairingRequirement.Disabled);
	return requirements.size > 0;
}
