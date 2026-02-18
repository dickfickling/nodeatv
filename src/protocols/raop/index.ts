/**
 * Support for audio streaming using Remote Audio Output Protocol (RAOP).
 */

import {
	DeviceModel,
	DeviceState,
	FeatureName,
	FeatureState,
	MediaType,
	OperatingSystem,
	Protocol,
} from "../../const.js";
import {
	AbstractPushUpdater,
	type Core,
	MutableService,
	type ProtocolStateDispatcher,
	type SetupData,
	type StateMessage,
	UpdatedState,
} from "../../core/core.js";
import type * as mdnsTypes from "../../core/mdns.js";
import {
	deviceInfoNameFromUniqueShortName,
	type ScanHandlerDeviceInfoName,
	type ScanHandlerReturn,
} from "../../core/scan.js";
import * as exceptions from "../../exceptions.js";
import { getUniqueId } from "../../helpers.js";
import {
	type BaseService,
	DeviceInfo,
	type FeatureInfo,
	Features,
	type MediaMetadata,
	Playing,
	PushUpdater,
	RemoteControl,
} from "../../interface.js";
import { lookupModel, lookupOs } from "../../support/deviceInfo.js";
import { type HttpConnection, httpConnect } from "../../support/http.js";
import { RtspSession } from "../../support/rtsp.js";
import { pair as airplayPair } from "../airplay/index.js";
import { AirPlayMajorVersion, getProtocolVersion } from "../airplay/utils.js";
import { AirPlayV1 } from "./protocols/airplayv1.js";
import { AirPlayV2 } from "./protocols/airplayv2.js";
import { StreamContext, type StreamProtocol } from "./protocols/index.js";
import {
	type PlaybackInfo,
	type RaopListener,
	StreamClient,
} from "./streamClient.js";

const INITIAL_VOLUME = 33.0; // Percent

/**
 * Implementation of push update support for RAOP.
 */
export class RaopPushUpdater extends AbstractPushUpdater {
	private _activated = false;
	private _metadata: { playing(): Promise<Playing> };

	constructor(
		metadata: { playing(): Promise<Playing> },
		stateDispatcher: ProtocolStateDispatcher,
	) {
		super(stateDispatcher);
		this._metadata = metadata;
	}

	get active(): boolean {
		return this._activated;
	}

	start(_initialDelay = 0): void {
		if (this.listener === null) {
			throw new exceptions.NoAsyncListenerError();
		}
		this._activated = true;
		this.stateUpdated();
	}

	stop(): void {
		this._activated = false;
	}

	async stateUpdated(): Promise<void> {
		try {
			const playing = await this._metadata.playing();
			this.postUpdate(playing);
		} catch {
			// Swallow playstatus errors during push updates
		}
	}
}

/**
 * Manage current play state for RAOP.
 */
export class RaopPlaybackManager {
	core: Core;
	playbackInfo: PlaybackInfo | null = null;
	private _isAcquired = false;
	private _context: StreamContext = new StreamContext();
	private _streamClient: StreamClient | null = null;
	private _connection: HttpConnection | null = null;

	constructor(core: Core) {
		this.core = core;
	}

	get context(): StreamContext {
		return this._context;
	}

	get streamClient(): StreamClient | null {
		return this._streamClient;
	}

	acquire(): void {
		if (this._isAcquired) {
			throw new exceptions.InvalidStateError("already streaming to device");
		}
		this._isAcquired = true;
	}

	async setup(service: BaseService): Promise<[StreamClient, StreamContext]> {
		if (this._streamClient && this._context) {
			return [this._streamClient, this._context];
		}

		const address = this.core.config.address;
		const port = service.port;
		const raopSettings = this.core.settings.protocols.raop;

		const connection = await httpConnect(address, port);
		this._connection = connection;

		const rtsp = new RtspSession(connection);

		const version = getProtocolVersion(service, raopSettings.protocolVersion);
		let protocol: StreamProtocol;
		if (version === AirPlayMajorVersion.AirPlayV2) {
			protocol = new AirPlayV2(this._context, rtsp);
		} else {
			protocol = new AirPlayV1(this._context, rtsp);
		}

		// Pass credentials/password from service to context
		this._context.credentials = service.credentials;
		this._context.password = service.password;

		this._streamClient = new StreamClient(
			rtsp,
			this._context,
			protocol,
			this.core.settings,
		);
		await this._streamClient.initialize(service.properties);

		return [this._streamClient, this._context];
	}

	async teardown(): Promise<void> {
		if (this._streamClient) {
			this._streamClient.close();
		}
		this._streamClient = null;
		if (this._connection) {
			this._connection.close();
			this._connection = null;
		}
		this._context.reset();
		this._isAcquired = false;
	}
}

/**
 * Implementation of metadata interface for RAOP.
 */
export class RaopMetadata {
	private _playbackManager: RaopPlaybackManager;

	constructor(playbackManager: RaopPlaybackManager) {
		this._playbackManager = playbackManager;
	}

	async playing(): Promise<Playing> {
		if (this._playbackManager.playbackInfo === null) {
			return new Playing({
				deviceState: DeviceState.Idle,
				mediaType: MediaType.Unknown,
			});
		}

		const metadata = this._playbackManager.playbackInfo.metadata;
		const totalTime = metadata.duration ? Math.floor(metadata.duration) : null;
		return new Playing({
			deviceState: DeviceState.Playing,
			mediaType: MediaType.Music,
			title: metadata.title,
			artist: metadata.artist,
			album: metadata.album,
			position: Math.floor(this._playbackManager.playbackInfo.position),
			totalTime,
		});
	}
}

/**
 * Implementation of supported feature functionality.
 */
export class RaopFeatures extends Features {
	playbackManager: RaopPlaybackManager;

	constructor(playbackManager: RaopPlaybackManager) {
		super();
		this.playbackManager = playbackManager;
	}

	getFeature(featureName: FeatureName): FeatureInfo {
		if (featureName === FeatureName.StreamFile) {
			return { state: FeatureState.Available };
		}

		const metadata: MediaMetadata =
			this.playbackManager.playbackInfo?.metadata ?? {};

		if (featureName === FeatureName.Title) {
			return this._availability(metadata.title);
		}
		if (featureName === FeatureName.Artist) {
			return this._availability(metadata.artist);
		}
		if (featureName === FeatureName.Album) {
			return this._availability(metadata.album);
		}
		if (
			featureName === FeatureName.Position ||
			featureName === FeatureName.TotalTime
		) {
			return this._availability(metadata.duration);
		}

		// Volume controls are always supported
		if (
			[
				FeatureName.SetVolume,
				FeatureName.Volume,
				FeatureName.VolumeDown,
				FeatureName.VolumeUp,
			].includes(featureName)
		) {
			return { state: FeatureState.Available };
		}

		if (featureName === FeatureName.Stop || featureName === FeatureName.Pause) {
			const isStreaming = this.playbackManager.streamClient !== null;
			return {
				state: isStreaming ? FeatureState.Available : FeatureState.Unavailable,
			};
		}

		return { state: FeatureState.Unavailable };
	}

	private _availability(value: unknown): FeatureInfo {
		return {
			state: value ? FeatureState.Available : FeatureState.Unavailable,
		};
	}
}

/**
 * Implementation of audio functionality.
 */
export class RaopAudio {
	playbackManager: RaopPlaybackManager;
	private stateDispatcher: ProtocolStateDispatcher;

	constructor(
		playbackManager: RaopPlaybackManager,
		stateDispatcher: ProtocolStateDispatcher,
	) {
		this.playbackManager = playbackManager;
		this.stateDispatcher = stateDispatcher;
		this.stateDispatcher.listenTo(
			UpdatedState.Volume,
			(message: StateMessage) => this._volumeChanged(message),
		);
	}

	private _volumeChanged(message: StateMessage): void {
		const volume = message.value as number;
		this.playbackManager.context.volume = volume;
	}

	get hasChangedVolume(): boolean {
		return this.playbackManager.context.volume !== null;
	}

	get volume(): number {
		const vol = this.playbackManager.context.volume;
		if (vol === null) {
			return INITIAL_VOLUME;
		}
		return vol;
	}

	async setVolume(level: number): Promise<void> {
		const raop = this.playbackManager.streamClient;
		if (raop) {
			await raop.setVolume(level);
		} else {
			this.playbackManager.context.volume = level;
		}
		this.stateDispatcher.dispatch(UpdatedState.Volume, this.volume);
	}

	async volumeUp(): Promise<void> {
		await this.setVolume(Math.min(this.volume + 5.0, 100.0));
	}

	async volumeDown(): Promise<void> {
		await this.setVolume(Math.max(this.volume - 5.0, 0.0));
	}
}

/**
 * Implementation of remote control functionality.
 */
export class RaopRemoteControl extends RemoteControl {
	private audio: RaopAudio;
	private playbackManager: RaopPlaybackManager;

	constructor(audio: RaopAudio, playbackManager: RaopPlaybackManager) {
		super();
		this.audio = audio;
		this.playbackManager = playbackManager;
	}

	async pause(): Promise<void> {
		if (this.playbackManager.streamClient) {
			this.playbackManager.streamClient.stop();
		}
	}

	async stop(): Promise<void> {
		if (this.playbackManager.streamClient) {
			this.playbackManager.streamClient.stop();
		}
	}

	async volumeUp(): Promise<void> {
		await this.audio.setVolume(Math.min(this.audio.volume + 5.0, 100.0));
	}

	async volumeDown(): Promise<void> {
		await this.audio.setVolume(Math.max(this.audio.volume - 5.0, 0.0));
	}
}

// --- Scan ---

/**
 * Convert a RAOP service name to a name.
 * RAOP service names are `<mac>@<name>`, strip MAC prefix.
 */
export function raopNameFromServiceName(serviceName: string): string {
	const atIndex = serviceName.indexOf("@");
	return atIndex >= 0 ? serviceName.substring(atIndex + 1) : serviceName;
}

export function raopServiceHandler(
	mdnsService: mdnsTypes.Service,
	_response: mdnsTypes.Response,
): ScanHandlerReturn | null {
	const name = raopNameFromServiceName(mdnsService.name);
	const service = new MutableService(
		getUniqueId(mdnsService.type, mdnsService.name, mdnsService.properties),
		Protocol.RAOP,
		mdnsService.port,
		mdnsService.properties,
	);
	return [name, service];
}

/**
 * Return handlers used for scanning.
 */
export function scan(): Record<string, ScanHandlerDeviceInfoName> {
	return {
		"_raop._tcp.local": [raopServiceHandler, raopNameFromServiceName],
		"_airport._tcp.local": [
			(_service, _response) => null,
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
	if ("am" in properties) {
		const am = properties.am as string;
		const model = lookupModel(am);
		devinfo[DeviceInfo.RAW_MODEL] = am;
		if (model !== DeviceModel.Unknown) {
			devinfo[DeviceInfo.MODEL] = model;
		}
		const operatingSystem = lookupOs(am);
		if (operatingSystem !== OperatingSystem.Unknown) {
			devinfo[DeviceInfo.OPERATING_SYSTEM] = operatingSystem;
		}
	}
	if ("ov" in properties) {
		devinfo[DeviceInfo.VERSION] = properties.ov;
	}

	// This comes from _airport._tcp.local and belongs to AirPort Expresses
	if ("wama" in properties) {
		const wamaStr = `macaddress=${properties.wama}`;
		const props: Record<string, string> = {};
		for (const prop of wamaStr.split(",")) {
			const [key, value] = prop.split("=", 2);
			if (key && value) {
				props[key] = value;
			}
		}
		if (!(DeviceInfo.MAC in devinfo) && props.macaddress) {
			devinfo[DeviceInfo.MAC] = props.macaddress
				.replace(/-/g, ":")
				.toUpperCase();
		}
		if (props.syVs) {
			devinfo[DeviceInfo.VERSION] = props.syVs;
		}
	}
	return devinfo;
}

/**
 * Update service with additional information.
 */
export async function serviceInfo(
	_service: MutableService,
	_devinfo: DeviceInfo,
	_services: Map<Protocol, BaseService>,
): Promise<void> {
	// TODO: Check AirPlay service for ACL and pairing requirements
}

/**
 * Set up a new RAOP service.
 */
export function* setup(core: Core): Generator<SetupData> {
	const playbackManager = new RaopPlaybackManager(core);
	const metadata = new RaopMetadata(playbackManager);
	const pushUpdater = new RaopPushUpdater(metadata, core.stateDispatcher);

	class RaopStateListener implements RaopListener {
		playing(playbackInfo: PlaybackInfo): void {
			playbackManager.playbackInfo = playbackInfo;
			this._trigger();
		}

		stopped(): void {
			playbackManager.playbackInfo = null;
			this._trigger();
		}

		private _trigger(): void {
			if (pushUpdater.active) {
				pushUpdater.stateUpdated();
			}
		}
	}

	const _raopListener = new RaopStateListener();
	const raopAudio = new RaopAudio(playbackManager, core.stateDispatcher);

	const interfaces = new Map<unknown, unknown>();
	interfaces.set(Features, new RaopFeatures(playbackManager));
	interfaces.set(PushUpdater, pushUpdater);
	interfaces.set("Metadata", metadata);
	interfaces.set("Audio", raopAudio);
	interfaces.set(
		RemoteControl,
		new RaopRemoteControl(raopAudio, playbackManager),
	);

	const connect = async (): Promise<boolean> => {
		return true;
	};

	const close = (): Set<Promise<void>> => {
		return new Set([playbackManager.teardown()]);
	};

	const getDeviceInfo = (): Record<string, unknown> => {
		const devinfo: Record<string, unknown> = {};
		for (const serviceType of Object.keys(scan())) {
			const properties = core.config.properties[serviceType];
			if (properties) {
				Object.assign(devinfo, deviceInfo(serviceType, properties));
			}
		}
		return devinfo;
	};

	yield {
		protocol: Protocol.RAOP,
		connect,
		close,
		deviceInfo: getDeviceInfo,
		interfaces,
		features: new Set<FeatureName>([
			FeatureName.StreamFile,
			FeatureName.PushUpdates,
			FeatureName.Artist,
			FeatureName.Album,
			FeatureName.Title,
			FeatureName.Position,
			FeatureName.TotalTime,
			FeatureName.SetVolume,
			FeatureName.Volume,
			FeatureName.VolumeUp,
			FeatureName.VolumeDown,
			FeatureName.Stop,
			FeatureName.Pause,
		]),
	};
}

/**
 * Return pairing handler for protocol.
 * RAOP reuses the AirPlay pairing handler.
 */
export function pair(core: Core, _options?: Record<string, unknown>): unknown {
	// RAOP reuses the AirPlay pairing handler
	return airplayPair(core);
}
