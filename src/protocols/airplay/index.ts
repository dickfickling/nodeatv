/**
 * Implementation of external API for AirPlay.
 */

import {
	AuthenticationType,
	type HapCredentials,
} from "../../auth/hapPairing.js";
import {
	DeviceModel,
	FeatureName,
	FeatureState,
	OperatingSystem,
	Protocol,
} from "../../const.js";
import { type Core, MutableService, type SetupData } from "../../core/core.js";
import type * as mdns from "../../core/mdns.js";
import type {
	ScanHandlerDeviceInfoName,
	ScanHandlerReturn,
} from "../../core/scan.js";
import { deviceInfoNameFromUniqueShortName } from "../../core/scan.js";
import { PairingError } from "../../exceptions.js";
import { getUniqueId } from "../../helpers.js";
import {
	type BaseService,
	DeviceInfo,
	type FeatureInfo,
	Features,
	RemoteControl,
} from "../../interface.js";
import type { Settings } from "../../settings.js";
import { lookupModel, lookupOs } from "../../support/deviceInfo.js";
import { type HttpConnection, httpConnect } from "../../support/http.js";
import { RtspSession } from "../../support/rtsp.js";
import { AP2Session } from "./ap2Session.js";
import {
	extractCredentials,
	pairSetup,
	verifyConnection,
} from "./auth/index.js";
import { AirPlayMrpConnection } from "./mrpConnection.js";
import { AirPlayPlayer, type StreamProtocol } from "./player.js";
import {
	AirPlayFlags,
	AirPlayMajorVersion,
	getProtocolVersion,
	hasFlag,
	isRemoteControlSupported,
	parseFeatures,
	updateServiceDetails,
} from "./utils.js";

/**
 * Implementation of supported feature functionality.
 */
export class AirPlayFeatures extends Features {
	private _features: bigint;

	constructor(features: bigint) {
		super();
		this._features = features;
	}

	getFeature(featureName: FeatureName): FeatureInfo {
		if (
			featureName === FeatureName.PlayUrl &&
			(hasFlag(this._features, AirPlayFlags.SupportsAirPlayVideoV1) ||
				hasFlag(this._features, AirPlayFlags.SupportsAirPlayVideoV2))
		) {
			return { state: FeatureState.Available };
		}

		if (featureName === FeatureName.Stop) {
			return { state: FeatureState.Available };
		}

		return { state: FeatureState.Unavailable };
	}
}

/**
 * Stream interface stub for AirPlay.
 */
export interface Stream {
	playUrl(url: string, options?: Record<string, unknown>): Promise<void>;
	stop(): void;
	close(): void;
}

/**
 * Implementation of stream API with AirPlay.
 */
export class AirPlayStream implements Stream {
	core: Core;
	service: BaseService;
	private _connection: HttpConnection | null = null;

	constructor(core: Core) {
		this.core = core;
		this.service = core.service;
	}

	close(): void {
		if (this._connection !== null) {
			this._connection.close();
			this._connection = null;
		}
	}

	stop(): void {
		if (this._connection !== null) {
			this._connection.close();
		}
	}

	async playUrl(url: string, options?: Record<string, unknown>): Promise<void> {
		this._connection = await httpConnect(
			String(this.core.config.address),
			this.service.port,
		);
		try {
			const credentials = extractCredentials(this.service);
			await verifyConnection(credentials, this._connection);

			const rtsp = new RtspSession(this._connection);
			const position = Number(options?.position ?? 0);
			const player = new AirPlayPlayer(rtsp, this._createStreamProtocol(rtsp));
			await player.playUrl(url, position);
		} finally {
			if (this._connection) {
				this._connection.close();
				this._connection = null;
			}
		}
	}

	private _createStreamProtocol(rtsp: RtspSession): StreamProtocol {
		return {
			async playUrl(_timingPort: number, url: string, position: number) {
				return rtsp.exchange("POST", {
					uri: "/play",
					body: { "Content-Location": url, "Start-Position": position },
				});
			},
		};
	}
}

/**
 * Implementation of remote control functionality.
 */
export class AirPlayRemoteControl extends RemoteControl {
	private stream: AirPlayStream;

	constructor(stream: AirPlayStream) {
		super();
		this.stream = stream;
	}

	async stop(): Promise<void> {
		this.stream.stop();
	}
}

function airplayServiceHandler(
	mdnsService: mdns.Service,
	_response: mdns.Response,
): ScanHandlerReturn | null {
	const service = new MutableService(
		getUniqueId(mdnsService.type, mdnsService.name, mdnsService.properties),
		Protocol.AirPlay,
		mdnsService.port,
		mdnsService.properties,
	);
	return [mdnsService.name, service];
}

/**
 * Return handlers used for scanning.
 */
export function scan(): Record<string, ScanHandlerDeviceInfoName> {
	return {
		"_airplay._tcp.local": [
			airplayServiceHandler,
			deviceInfoNameFromUniqueShortName,
		],
	};
}

/**
 * Return device information from zeroconf properties.
 */
export function deviceInfo(
	_serviceType: string,
	properties: Record<string, unknown>,
): Record<string, unknown> {
	const devinfo: Record<string, unknown> = {};
	if (properties.model) {
		const model = lookupModel(properties.model as string);
		devinfo[DeviceInfo.RAW_MODEL] = properties.model;
		if (model !== DeviceModel.Unknown) {
			devinfo[DeviceInfo.MODEL] = model;
		}
		const operatingSystem = lookupOs(properties.model as string);
		if (operatingSystem !== OperatingSystem.Unknown) {
			devinfo[DeviceInfo.OPERATING_SYSTEM] = operatingSystem;
		}
	}
	if (properties.osvers) {
		devinfo[DeviceInfo.VERSION] = properties.osvers;
	}
	if (properties.deviceid) {
		devinfo[DeviceInfo.MAC] = properties.deviceid;
	}
	if (properties.psi) {
		devinfo[DeviceInfo.OUTPUT_DEVICE_ID] = properties.psi;
	} else if (properties.pi) {
		devinfo[DeviceInfo.OUTPUT_DEVICE_ID] = properties.pi;
	}
	return devinfo;
}

/**
 * Update service with additional information.
 */
export async function serviceInfo(
	service: MutableService,
	_devinfo: DeviceInfo,
	_services: Map<Protocol, BaseService>,
): Promise<void> {
	updateServiceDetails(service);
}

/**
 * Set up a new AirPlay service.
 */
export function* setup(core: Core): Generator<SetupData, void, undefined> {
	const stream = new AirPlayStream(core);

	const features = parseFeatures(core.service.properties.features ?? "0x0");
	const credentials = extractCredentials(core.service);

	const interfaces = new Map<unknown, unknown>();
	interfaces.set(Features, new AirPlayFeatures(features));
	interfaces.set(RemoteControl, new AirPlayRemoteControl(stream));

	const _connect = async (): Promise<boolean> => {
		return true;
	};

	const _close = (): Set<Promise<void>> => {
		stream.close();
		return new Set();
	};

	const _deviceInfo = (): Record<string, unknown> => {
		const serviceTypes = Object.keys(scan());
		return deviceInfo(serviceTypes[0], core.service.properties);
	};

	yield {
		protocol: Protocol.AirPlay,
		connect: _connect,
		close: _close,
		deviceInfo: _deviceInfo,
		interfaces,
		features: new Set([FeatureName.PlayUrl, FeatureName.Stop]),
	};

	// Check if unified advertiser (AirPlay 2 also serves RAOP)
	if (
		hasFlag(features, AirPlayFlags.HasUnifiedAdvertiserInfo) &&
		core.config.getService(Protocol.RAOP) === null
	) {
		const raopService = new MutableService(
			null,
			Protocol.RAOP,
			core.service.port,
			core.service.properties,
			core.service.credentials,
			core.service.password,
		);
		core.config.addService(raopService);
	}

	// MRP tunnel over AirPlay
	const mrpTunnel =
		(core.settings as Settings)?.protocols?.airplay?.mrpTunnel ?? "auto";

	if (mrpTunnel === "disable") {
		// Remote control tunnel disabled
	} else if (mrpTunnel === "force") {
		yield createMrpTunnelData(core, credentials);
	} else if (!isRemoteControlSupported(core.service, credentials)) {
		// Remote control not supported
	} else if (
		credentials.type !== AuthenticationType.HAP &&
		credentials.type !== AuthenticationType.Transient
	) {
		// Auth type not supported for remote control
	} else {
		yield createMrpTunnelData(core, credentials);
	}
}

function createMrpTunnelData(
	core: Core,
	credentials: HapCredentials,
): SetupData {
	const session = new AP2Session(
		String(core.config.address),
		core.service.port,
		credentials,
		(core.settings as Settings).info,
	);

	const mrpConnection = new AirPlayMrpConnection(
		session,
		core.deviceListener as never,
	);

	const _connect = async (): Promise<boolean> => {
		await session.connect();
		await session.setupRemoteControl();
		session.startKeepAlive(core.deviceListener as never);
		await mrpConnection.connect();
		return true;
	};

	const _close = (): Set<Promise<void>> => {
		const tasks = new Set<Promise<void>>();
		mrpConnection.close();
		for (const task of session.stop()) {
			tasks.add(task);
		}
		return tasks;
	};

	const _deviceInfo = (): Record<string, unknown> => {
		return deviceInfo(Object.keys(scan())[0], core.service.properties);
	};

	return {
		protocol: Protocol.MRP,
		connect: _connect,
		close: _close,
		deviceInfo: _deviceInfo,
		interfaces: new Map(),
		features: new Set(),
	};
}

/**
 * Pairing handler for AirPlay protocol.
 */
export class AirPlayPairingHandler {
	private _core: Core;
	private _pinCode: number | null = null;
	private _hasPaired = false;
	private _connection: HttpConnection | null = null;
	private _pairingProcedure:
		| import("../../auth/hapPairing.js").PairSetupProcedure
		| null = null;

	constructor(core: Core) {
		this._core = core;
	}

	get hasPaired(): boolean {
		return this._hasPaired;
	}

	get deviceProvidesPin(): boolean {
		return true;
	}

	pin(pinCode: number): void {
		this._pinCode = pinCode;
	}

	async begin(): Promise<void> {
		this._connection = await httpConnect(
			String(this._core.config.address),
			this._core.service.port,
		);
		this._pairingProcedure = pairSetup(
			AuthenticationType.HAP,
			this._connection,
		);
		await this._pairingProcedure.startPairing();
	}

	async finish(): Promise<void> {
		if (!this._pinCode) {
			throw new PairingError("no pin given");
		}
		if (!this._pairingProcedure) {
			throw new PairingError("begin() must be called first");
		}

		const credentials = await this._pairingProcedure.finishPairing(
			"",
			this._pinCode,
			null,
		);

		this._core.service.credentials = credentials.toString();
		this._core.settings.protocols.airplay.credentials =
			this._core.service.credentials;
		this._hasPaired = true;
	}

	async close(): Promise<void> {
		if (this._connection) {
			this._connection.close();
			this._connection = null;
		}
	}
}

/**
 * Return pairing handler for AirPlay protocol.
 */
export function pair(core: Core): AirPlayPairingHandler {
	return new AirPlayPairingHandler(core);
}

export {
	AirPlayFlags,
	AirPlayMajorVersion,
	hasFlag,
	parseFeatures,
	getProtocolVersion,
	isRemoteControlSupported,
	updateServiceDetails,
	extractCredentials,
};
