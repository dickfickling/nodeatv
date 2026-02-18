/**
 * Manage announced AirPlay features.
 */

import {
	AuthenticationType,
	type HapCredentials,
	TRANSIENT_CREDENTIALS,
} from "../../auth/hapPairing.js";
import { PairingRequirement } from "../../const.js";
import type { MutableService } from "../../core/core.js";
import type { BaseService } from "../../interface.js";
import { AirPlayVersion } from "../../settings.js";
import type { HttpRequest, HttpResponse } from "../../support/http.js";
import { mapRange } from "../../support/utils.js";

// Status flags
const PIN_REQUIRED = 0x8;
const PASSWORD_BIT = 0x80;
const LEGACY_PAIRING_BIT = 0x200;

const DBFS_MIN = -30.0;
const DBFS_MAX = 0.0;
const PERCENTAGE_MIN = 0.0;
const PERCENTAGE_MAX = 100.0;

const UNSUPPORTED_MODELS = [/^Mac\d+,\d+$/];

export enum AirPlayMajorVersion {
	AirPlayV1 = "AirPlayV1",
	AirPlayV2 = "AirPlayV2",
}

function getFlags(properties: Record<string, string>): number {
	const flags = properties.sf ?? properties.flags ?? "0x0";
	return Number.parseInt(flags, 16);
}

/**
 * Features supported by AirPlay.
 *
 * These flags have been imported from:
 * https://emanuelecozzi.net/docs/airplay2/features/
 */
export const AirPlayFlags = {
	SupportsAirPlayVideoV1: 1n << 0n,
	SupportsAirPlayPhoto: 1n << 1n,
	SupportsAirPlaySlideShow: 1n << 5n,
	SupportsAirPlayScreen: 1n << 7n,
	SupportsAirPlayAudio: 1n << 9n,
	AudioRedundant: 1n << 11n,
	Authentication_4: 1n << 14n,
	MetadataFeatures_0: 1n << 15n,
	MetadataFeatures_1: 1n << 16n,
	MetadataFeatures_2: 1n << 17n,
	AudioFormats_0: 1n << 18n,
	AudioFormats_1: 1n << 19n,
	AudioFormats_2: 1n << 20n,
	AudioFormats_3: 1n << 21n,
	Authentication_1: 1n << 23n,
	Authentication_8: 1n << 26n,
	SupportsLegacyPairing: 1n << 27n,
	HasUnifiedAdvertiserInfo: 1n << 30n,
	IsCarPlay: 1n << 32n,
	SupportsAirPlayVideoPlayQueue: 1n << 33n,
	SupportsAirPlayFromCloud: 1n << 34n,
	SupportsTLS_PSK: 1n << 35n,
	SupportsUnifiedMediaControl: 1n << 38n,
	SupportsBufferedAudio: 1n << 40n,
	SupportsPTP: 1n << 41n,
	SupportsScreenMultiCodec: 1n << 42n,
	SupportsSystemPairing: 1n << 43n,
	IsAPValeriaScreenSender: 1n << 44n,
	SupportsHKPairingAndAccessControl: 1n << 46n,
	SupportsCoreUtilsPairingAndEncryption: 1n << 48n,
	SupportsAirPlayVideoV2: 1n << 49n,
	MetadataFeatures_3: 1n << 50n,
	SupportsUnifiedPairSetupandMFi: 1n << 51n,
	SupportsSetPeersExtendedMessage: 1n << 52n,
	SupportsAPSync: 1n << 54n,
	SupportsWoL: 1n << 55n,
	SupportsWoL2: 1n << 56n,
	SupportsHangdogRemoteControl: 1n << 58n,
	SupportsAudioStreamConnectionSetup: 1n << 59n,
	SupportsAudioMetadataControl: 1n << 60n,
	SupportsRFC2198Redundancy: 1n << 61n,
} as const;

export type AirPlayFlagsValue = bigint;

/**
 * Check if a specific flag is present in the feature set.
 */
export function hasFlag(features: bigint, flag: bigint): boolean {
	return (features & flag) !== 0n;
}

/**
 * Parse an AirPlay feature string and return what is supported.
 *
 * A feature string has one of the following formats:
 *   - 0x12345678
 *   - 0x12345678,0xabcdef12 => 0xabcdef1212345678
 */
export function parseFeatures(features: string): bigint {
	const match = features.match(
		/^0x([0-9A-Fa-f]{1,8})(?:,0x([0-9A-Fa-f]{1,8})|)$/,
	);
	if (match === null) {
		throw new Error(`invalid feature string: ${features}`);
	}

	let value = match[1];
	const upper = match[2];
	if (upper !== undefined) {
		value = upper + value;
	}
	return BigInt(`0x${value}`);
}

/**
 * Return if password is required by AirPlay service.
 */
export function isPasswordRequired(service: BaseService): boolean {
	if ((service.properties.pw ?? "false").toLowerCase() === "true") {
		return true;
	}

	if (getFlags(service.properties) & PASSWORD_BIT) {
		return true;
	}

	return false;
}

/**
 * Return pairing requirement for service.
 */
export function getPairingRequirement(
	service: BaseService,
): PairingRequirement {
	if (getFlags(service.properties) & (LEGACY_PAIRING_BIT | PIN_REQUIRED)) {
		return PairingRequirement.Mandatory;
	}

	if ((service.properties.act ?? "0") === "2") {
		return PairingRequirement.Unsupported;
	}
	return PairingRequirement.NotNeeded;
}

/**
 * Return if device supports remote control tunneling.
 */
export function isRemoteControlSupported(
	service: BaseService,
	credentials: HapCredentials,
): boolean {
	const model = service.properties.model ?? "";

	// HomePod supports remote control but only with transient credentials
	if (model.startsWith("AudioAccessory")) {
		return credentials.equals(TRANSIENT_CREDENTIALS);
	}

	if (!model.startsWith("AppleTV")) {
		return false;
	}

	// tvOS must be at least version 13 and HAP credentials are required
	const version = (service.properties.osvers ?? "0.0").split(".")[0];
	return (
		Number.parseFloat(version) >= 13.0 &&
		credentials.type === AuthenticationType.HAP
	);
}

/**
 * Encode a binary plist payload.
 */
export function encodePlistBody(data: unknown): Buffer {
	try {
		const bplistCreator = require("bplist-creator") as (obj: unknown) => Buffer;
		return bplistCreator(data);
	} catch {
		return Buffer.from(JSON.stringify(data), "utf-8");
	}
}

/**
 * Decode a binary plist payload.
 */
export function decodePlistBody(
	body: string | Buffer | Record<string, unknown>,
): Record<string, unknown> | null {
	if (typeof body === "object" && !Buffer.isBuffer(body)) {
		return body;
	}

	try {
		const bplistParser = require("bplist-parser") as {
			parseBuffer(buf: Buffer): unknown[];
		};
		const buf = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
		const parsed = bplistParser.parseBuffer(buf);
		return (parsed[0] ?? null) as Record<string, unknown> | null;
	} catch {
		return null;
	}
}

/**
 * Log an AirPlay request with optional binary plist body.
 */
export function logRequest(
	_logger: { debug(...args: unknown[]): void },
	_request: HttpRequest,
	_messagePrefix = "",
): void {
	// Logging stub - would log request details in debug mode
}

/**
 * Log an AirPlay response with optional binary plist body.
 */
export function logResponse(
	_logger: { debug(...args: unknown[]): void },
	_response: HttpResponse,
	_messagePrefix = "",
): void {
	// Logging stub - would log response details in debug mode
}

/**
 * Return major AirPlay version supported by a service.
 */
export function getProtocolVersion(
	service: BaseService,
	preferredVersion: AirPlayVersion,
): AirPlayMajorVersion {
	if (preferredVersion === AirPlayVersion.Auto) {
		let features = service.properties.ft;
		if (!features) {
			features = service.properties.features ?? "0x0";
		}

		const parsedFeatures = parseFeatures(features);
		if (
			hasFlag(parsedFeatures, AirPlayFlags.SupportsUnifiedMediaControl) ||
			hasFlag(
				parsedFeatures,
				AirPlayFlags.SupportsCoreUtilsPairingAndEncryption,
			)
		) {
			return AirPlayMajorVersion.AirPlayV2;
		}
		return AirPlayMajorVersion.AirPlayV1;
	}
	if (preferredVersion === AirPlayVersion.V2) {
		return AirPlayMajorVersion.AirPlayV2;
	}
	return AirPlayMajorVersion.AirPlayV1;
}

/**
 * Update AirPlay service according to what it supports.
 */
export function updateServiceDetails(service: MutableService): void {
	service.requiresPassword = isPasswordRequired(service);

	if ((service.properties.acl ?? "0") === "1") {
		service.pairing = PairingRequirement.Disabled;
	} else if (
		UNSUPPORTED_MODELS.some((model) =>
			model.test(service.properties.model ?? ""),
		)
	) {
		service.pairing = PairingRequirement.Unsupported;
	} else {
		service.pairing = getPairingRequirement(service);
	}
}

/**
 * Convert percentage level to dBFS.
 * Used for volume levels in AirPlay.
 */
export function pctToDbfs(level: number): number {
	if (Math.abs(level) < 1e-9) {
		return -144.0;
	}

	return mapRange(level, PERCENTAGE_MIN, PERCENTAGE_MAX, DBFS_MIN, DBFS_MAX);
}

/**
 * Convert dBFS to percentage.
 */
export function dbfsToPct(level: number): number {
	if (level < DBFS_MIN) {
		return PERCENTAGE_MIN;
	}

	return mapRange(level, DBFS_MIN, DBFS_MAX, PERCENTAGE_MIN, PERCENTAGE_MAX);
}
