/**
 * Implementation of the MediaRemoteTV Protocol used by ATV4 and later.
 */

import { SRPAuthHandler } from "../../auth/hapSrp.js";
import {
	DeviceState,
	FeatureName,
	FeatureState,
	InputAction,
	MediaType,
	OperatingSystem,
	PairingRequirement,
	Protocol,
	RepeatState,
	ShuffleState,
} from "../../const.js";
import {
	AbstractPushUpdater,
	type Core,
	MutableService,
	type ProtocolStateDispatcher,
	type SetupData,
} from "../../core/core.js";
import type * as mdnsTypes from "../../core/mdns.js";
import type {
	ScanHandlerDeviceInfoName,
	ScanHandlerReturn,
} from "../../core/scan.js";
import { deviceInfoNameFromUniqueShortName } from "../../core/scan.js";
import * as exceptions from "../../exceptions.js";
import { getUniqueId } from "../../helpers.js";
import type { BaseConfig, BaseService } from "../../interface.js";
import {
	DeviceInfo,
	type FeatureInfo,
	Features,
	Playing as PlayingClass,
	PushUpdater,
	RemoteControl,
} from "../../interface.js";
import { MrpConnection } from "./connection.js";
import * as messages from "./messages.js";
import { Command } from "./messages.js";
import { MrpPairingHandler } from "./pairing.js";
import {
	PlaybackState,
	type PlayerState,
	PlayerStateManager,
} from "./playerState.js";
import * as protobuf from "./protobuf/index.js";
import { MrpProtocol } from "./protocol.js";

const _DEFAULT_SKIP_TIME = 15;

// Source: https://github.com/Daij-Djan/DDHidLib/blob/master/usb_hid_usages.txt
const _KEY_LOOKUP: Record<string, [number, number]> = {
	up: [1, 0x8c],
	down: [1, 0x8d],
	left: [1, 0x8b],
	right: [1, 0x8a],
	stop: [12, 0xb7],
	next: [12, 0xb5],
	previous: [12, 0xb6],
	select: [1, 0x89],
	menu: [1, 0x86],
	topmenu: [12, 0x60],
	home: [12, 0x40],
	suspend: [1, 0x82],
	wakeup: [1, 0x83],
	volume_up: [12, 0xe9],
	volume_down: [12, 0xea],
};

const _FEATURES_SUPPORTED: FeatureName[] = [
	FeatureName.Down,
	FeatureName.Home,
	FeatureName.HomeHold,
	FeatureName.Left,
	FeatureName.Menu,
	FeatureName.Right,
	FeatureName.Select,
	FeatureName.TopMenu,
	FeatureName.Up,
	FeatureName.TurnOn,
	FeatureName.TurnOff,
	FeatureName.PowerState,
	FeatureName.OutputDevices,
	FeatureName.AddOutputDevices,
	FeatureName.RemoveOutputDevices,
	FeatureName.SetOutputDevices,
];

const _FEATURE_COMMAND_MAP: Record<number, number> = {
	[FeatureName.Next]: Command.NextTrack,
	[FeatureName.Pause]: Command.Pause,
	[FeatureName.Play]: Command.Play,
	[FeatureName.PlayPause]: Command.TogglePlayPause,
	[FeatureName.Previous]: Command.PreviousTrack,
	[FeatureName.Stop]: Command.Stop,
	[FeatureName.SetPosition]: Command.SeekToPlaybackPosition,
	[FeatureName.SetRepeat]: Command.ChangeRepeatMode,
	[FeatureName.SetShuffle]: Command.ChangeShuffleMode,
	[FeatureName.Shuffle]: Command.ChangeShuffleMode,
	[FeatureName.Repeat]: Command.ChangeRepeatMode,
	[FeatureName.SkipForward]: Command.SkipForward,
	[FeatureName.SkipBackward]: Command.SkipBackward,
};

const _FIELD_FEATURES: Record<number, string> = {
	[FeatureName.Title]: "title",
	[FeatureName.Artist]: "trackArtistName",
	[FeatureName.Album]: "albumName",
	[FeatureName.Genre]: "genre",
	[FeatureName.TotalTime]: "duration",
	[FeatureName.Position]: "elapsedTimeTimestamp",
	[FeatureName.SeriesName]: "seriesName",
	[FeatureName.SeasonNumber]: "seasonNumber",
	[FeatureName.EpisodeNumber]: "episodeNumber",
	[FeatureName.ContentIdentifier]: "contentIdentifier",
	[FeatureName.iTunesStoreIdentifier]: "iTunesStoreIdentifier",
};

const DELAY_BETWEEN_COMMANDS = 100; // ms

// Apple Cocoa epoch (2001-01-01) to JS Date
function _cocoaToTimestamp(time: number): Date {
	// Cocoa epoch is 2001-01-01T00:00:00Z
	// Unix epoch is 1970-01-01T00:00:00Z
	// Difference in seconds: 978307200
	const COCOA_EPOCH_OFFSET = 978307200;
	return new Date((time + COCOA_EPOCH_OFFSET) * 1000);
}

// Content metadata media type enum values
const ContentMediaType = {
	Audio: 1,
	Video: 2,
} as const;

/**
 * Build a Playing instance from player state.
 */
export function buildPlayingInstance(state: PlayerState): PlayingClass {
	function mediaType(): MediaType {
		if (state.metadata) {
			const mt = state.metadata.mediaType;
			if (mt === ContentMediaType.Audio) return MediaType.Music;
			if (mt === ContentMediaType.Video) return MediaType.Video;
		}
		return MediaType.Unknown;
	}

	function deviceState(): DeviceState {
		const stateMap: Record<number, DeviceState> = {
			[PlaybackState.Playing]: DeviceState.Playing,
			[PlaybackState.Paused]: DeviceState.Paused,
			[PlaybackState.Stopped]: DeviceState.Stopped,
			[PlaybackState.Interrupted]: DeviceState.Loading,
			[PlaybackState.Seeking]: DeviceState.Seeking,
		};
		if (state.playbackState === null) return DeviceState.Idle;
		return stateMap[state.playbackState] ?? DeviceState.Paused;
	}

	function title(): string | null {
		return (state.metadataField("title") as string) ?? null;
	}

	function artist(): string | null {
		return (state.metadataField("trackArtistName") as string) ?? null;
	}

	function album(): string | null {
		return (state.metadataField("albumName") as string) ?? null;
	}

	function genre(): string | null {
		return (state.metadataField("genre") as string) ?? null;
	}

	function totalTime(): number | null {
		const duration = state.metadataField("duration") as number | null;
		if (duration === null || Number.isNaN(duration)) return null;
		return Math.floor(duration);
	}

	function position(): number | null {
		const elapsedTimestamp = state.metadataField("elapsedTimeTimestamp") as
			| number
			| null;
		if (!elapsedTimestamp) return null;

		const elapsedTime = (state.metadataField("elapsedTime") as number) || 0;
		const refTime = _cocoaToTimestamp(elapsedTimestamp);
		const diff = (Date.now() - refTime.getTime()) / 1000;

		const playbackRate = (state.metadataField("playbackRate") as number) || 0.0;
		if (
			deviceState() === DeviceState.Playing &&
			Math.abs(playbackRate) > 0.001
		) {
			return Math.floor(elapsedTime + diff);
		}
		return Math.floor(elapsedTime);
	}

	function shuffleState(): ShuffleState {
		const info = state.commandInfo(Command.ChangeShuffleMode);
		if (!info) return ShuffleState.Off;
		if (info.shuffleMode === messages.ProtoShuffleMode.Off)
			return ShuffleState.Off;
		if (info.shuffleMode === messages.ProtoShuffleMode.Albums)
			return ShuffleState.Albums;
		return ShuffleState.Songs;
	}

	function repeatState(): RepeatState {
		const info = state.commandInfo(Command.ChangeRepeatMode);
		if (!info) return RepeatState.Off;
		if (info.repeatMode === messages.ProtoRepeatMode.One)
			return RepeatState.Track;
		if (info.repeatMode === messages.ProtoRepeatMode.All)
			return RepeatState.All;
		return RepeatState.Off;
	}

	return new PlayingClass({
		mediaType: mediaType(),
		deviceState: deviceState(),
		title: title(),
		artist: artist(),
		album: album(),
		genre: genre(),
		totalTime: totalTime(),
		position: position(),
		shuffle: shuffleState(),
		repeat: repeatState(),
		hash: state.itemIdentifier,
		seriesName: (state.metadataField("seriesName") as string) ?? null,
		seasonNumber: (state.metadataField("seasonNumber") as number) ?? null,
		episodeNumber: (state.metadataField("episodeNumber") as number) ?? null,
		contentIdentifier:
			(state.metadataField("contentIdentifier") as string) ?? null,
		itunesStoreIdentifier:
			(state.metadataField("iTunesStoreIdentifier") as number) ?? null,
	});
}

// --- HID key sending helper ---

async function _sendHidKey(
	protocol: MrpProtocol,
	key: string,
	action: InputAction,
	flush = true,
): Promise<void> {
	async function _doPress(
		keycode: [number, number],
		hold: boolean,
	): Promise<void> {
		await protocol.send(messages.sendHidEvent(keycode[0], keycode[1], true));

		if (hold) {
			await new Promise<void>((r) => setTimeout(r, 1000));
		}

		await protocol.send(messages.sendHidEvent(keycode[0], keycode[1], false));

		if (flush) {
			await protocol.sendAndReceive(messages.create(protobuf.GENERIC_MESSAGE));
		}
	}

	const keycode = _KEY_LOOKUP[key];
	if (!keycode) {
		throw new exceptions.NotSupportedError(`unsupported key: ${key}`);
	}

	if (action === InputAction.SingleTap) {
		await _doPress(keycode, false);
	} else if (action === InputAction.DoubleTap) {
		await _doPress(keycode, false);
		await _doPress(keycode, false);
	} else if (action === InputAction.Hold) {
		await _doPress(keycode, true);
	} else {
		throw new exceptions.NotSupportedError(
			`unsupported input action: ${action}`,
		);
	}
}

// --- MrpRemoteControl ---

export class MrpRemoteControl extends RemoteControl {
	private psm: PlayerStateManager;
	private protocol: MrpProtocol;

	constructor(psm: PlayerStateManager, protocol: MrpProtocol) {
		super();
		this.psm = psm;
		this.protocol = protocol;
	}

	private async _sendCommand(
		command: number,
		options?: Record<string, unknown>,
	): Promise<void> {
		const resp = await this.protocol.sendAndReceive(
			messages.sendCommand(command, options),
		);
		const inner = resp.sendCommandResultMessage as
			| Record<string, unknown>
			| undefined;
		if (inner && (inner.sendError as number) !== 0) {
			throw new exceptions.CommandError(
				`command ${command} failed: sendError=${inner.sendError}`,
			);
		}
	}

	async up(action: InputAction = InputAction.SingleTap): Promise<void> {
		await _sendHidKey(this.protocol, "up", action);
	}

	async down(action: InputAction = InputAction.SingleTap): Promise<void> {
		await _sendHidKey(this.protocol, "down", action);
	}

	async left(action: InputAction = InputAction.SingleTap): Promise<void> {
		await _sendHidKey(this.protocol, "left", action);
	}

	async right(action: InputAction = InputAction.SingleTap): Promise<void> {
		await _sendHidKey(this.protocol, "right", action);
	}

	async play(): Promise<void> {
		await this._sendCommand(Command.Play);
	}

	async playPause(): Promise<void> {
		const cmd = this.psm.playing.commandInfo(Command.TogglePlayPause);
		if (cmd?.enabled) {
			await this._sendCommand(Command.TogglePlayPause);
		} else {
			const state = this.psm.playing.playbackState;
			if (state === PlaybackState.Playing) {
				await this.pause();
			} else if (state === PlaybackState.Paused) {
				await this.play();
			}
		}
	}

	async pause(): Promise<void> {
		await this._sendCommand(Command.Pause);
	}

	async stop(): Promise<void> {
		await this._sendCommand(Command.Stop);
	}

	async next(): Promise<void> {
		await this._sendCommand(Command.NextTrack);
	}

	async previous(): Promise<void> {
		await this._sendCommand(Command.PreviousTrack);
	}

	async select(action: InputAction = InputAction.SingleTap): Promise<void> {
		await _sendHidKey(this.protocol, "select", action);
	}

	async menu(action: InputAction = InputAction.SingleTap): Promise<void> {
		await _sendHidKey(this.protocol, "menu", action);
	}

	async volumeUp(): Promise<void> {
		await _sendHidKey(this.protocol, "volume_up", InputAction.SingleTap);
	}

	async volumeDown(): Promise<void> {
		await _sendHidKey(this.protocol, "volume_down", InputAction.SingleTap);
	}

	async home(action: InputAction = InputAction.SingleTap): Promise<void> {
		await _sendHidKey(this.protocol, "home", action);
	}

	async homeHold(): Promise<void> {
		await _sendHidKey(this.protocol, "home", InputAction.Hold);
	}

	async topMenu(): Promise<void> {
		await _sendHidKey(this.protocol, "topmenu", InputAction.SingleTap);
	}

	async suspend(): Promise<void> {
		await _sendHidKey(this.protocol, "suspend", InputAction.SingleTap);
	}

	async wakeup(): Promise<void> {
		await _sendHidKey(this.protocol, "wakeup", InputAction.SingleTap);
	}

	async skipForward(timeInterval = 0.0): Promise<void> {
		await this._skipCommand(Command.SkipForward, timeInterval);
	}

	async skipBackward(timeInterval = 0.0): Promise<void> {
		await this._skipCommand(Command.SkipBackward, timeInterval);
	}

	private async _skipCommand(
		command: number,
		timeInterval: number,
	): Promise<void> {
		const info = this.psm.playing.commandInfo(command);

		let skipInterval: number;
		if (timeInterval > 0) {
			skipInterval = Math.floor(timeInterval);
		} else if (info?.preferredIntervals?.length) {
			skipInterval = info.preferredIntervals[0];
		} else {
			skipInterval = _DEFAULT_SKIP_TIME;
		}

		await this._sendCommand(command, { skipInterval });
	}

	async setPosition(pos: number): Promise<void> {
		await this.protocol.sendAndReceive(messages.seekToPosition(pos));
	}

	async setShuffle(shuffleState: ShuffleState): Promise<void> {
		await this.protocol.sendAndReceive(messages.shuffle(shuffleState));
	}

	async setRepeat(repeatState: RepeatState): Promise<void> {
		await this.protocol.sendAndReceive(messages.repeat(repeatState));
	}
}

// --- MrpMetadata ---

export class MrpMetadata {
	identifier: string | null;
	private psm: PlayerStateManager;

	constructor(identifier: string | null, psm: PlayerStateManager) {
		this.identifier = identifier;
		this.psm = psm;
	}

	get deviceId(): string | null {
		return this.identifier;
	}

	async playing(): Promise<PlayingClass> {
		return buildPlayingInstance(this.psm.playing);
	}

	get artworkId(): string | null {
		const metadata = this.psm.playing.metadata;
		if (metadata && (metadata.artworkAvailable || metadata.artworkURL)) {
			if (metadata.artworkIdentifier) return metadata.artworkIdentifier;
			if (metadata.contentIdentifier) return metadata.contentIdentifier;
			return this.psm.playing.itemIdentifier;
		}
		return null;
	}
}

// --- MrpPower ---

export class MrpPower {
	private protocol: MrpProtocol;
	private remote: MrpRemoteControl;

	constructor(protocol: MrpProtocol, remote: MrpRemoteControl) {
		this.protocol = protocol;
		this.remote = remote;
	}

	async turnOn(): Promise<void> {
		await this.protocol.send(messages.wakeDevice());
	}

	async turnOff(): Promise<void> {
		await this.remote.home(InputAction.Hold);
		await new Promise<void>((r) => setTimeout(r, DELAY_BETWEEN_COMMANDS));
		await this.remote.select();
	}
}

// --- MrpPushUpdater ---

export class MrpPushUpdater extends AbstractPushUpdater {
	private metadata: MrpMetadata;
	private psm: PlayerStateManager;

	constructor(
		metadata: MrpMetadata,
		psm: PlayerStateManager,
		stateDispatcher: ProtocolStateDispatcher,
	) {
		super(stateDispatcher);
		this.metadata = metadata;
		this.psm = psm;
	}

	get active(): boolean {
		return (
			this.psm.listener ===
			(this as unknown as { stateUpdated(): Promise<void> })
		);
	}

	start(_initialDelay = 0): void {
		if (this.listener === null) {
			throw new exceptions.NoAsyncListenerError();
		}
		if (this.active) return;

		this.psm.listener = this as unknown as {
			stateUpdated(): Promise<void>;
		};
		// Trigger an initial state update
		this.stateUpdated().catch(() => {});
	}

	stop(): void {
		this.psm.listener = null;
	}

	async stateUpdated(): Promise<void> {
		try {
			const playstatus = await this.metadata.playing();
			this.postUpdate(playstatus);
		} catch {
			// Ignore errors during state update
		}
	}
}

// --- MrpAudio ---

export class MrpAudio {
	private protocol: MrpProtocol;

	constructor(protocol: MrpProtocol) {
		this.protocol = protocol;
	}

	get deviceUid(): string | null {
		if (this.protocol.deviceInfo !== null) {
			const inner = this.protocol.deviceInfo.deviceInfoMessage as
				| Record<string, unknown>
				| undefined;
			if (inner) {
				return (
					(inner.clusterID as string) ?? (inner.deviceUID as string) ?? null
				);
			}
		}
		return null;
	}

	async setVolume(level: number): Promise<void> {
		const uid = this.deviceUid;
		if (!uid) {
			throw new exceptions.ProtocolError("no output device");
		}
		await this.protocol.send(messages.setVolume(uid, level / 100.0));
	}

	async addOutputDevices(...devices: string[]): Promise<void> {
		await this.protocol.send(messages.addOutputDevices(...devices));
	}

	async removeOutputDevices(...devices: string[]): Promise<void> {
		await this.protocol.send(messages.removeOutputDevices(...devices));
	}

	async setOutputDevices(...devices: string[]): Promise<void> {
		await this.protocol.send(messages.setOutputDevices(...devices));
	}
}

// --- MrpFeatures ---

export class MrpFeatures extends Features {
	private psm: PlayerStateManager;

	constructor(_config: BaseConfig, psm: PlayerStateManager) {
		super();
		this.psm = psm;
	}

	getFeature(featureName: FeatureName): FeatureInfo {
		if (_FEATURES_SUPPORTED.includes(featureName)) {
			return { state: FeatureState.Available };
		}

		if (featureName === FeatureName.Artwork) {
			const metadata = this.psm.playing.metadata;
			if (metadata?.artworkAvailable) {
				return { state: FeatureState.Available };
			}
			return { state: FeatureState.Unavailable };
		}

		const fieldName = _FIELD_FEATURES[featureName];
		if (fieldName) {
			const available = this.psm.playing.metadataField(fieldName) !== null;
			return {
				state: available ? FeatureState.Available : FeatureState.Unavailable,
			};
		}

		const cmdId = _FEATURE_COMMAND_MAP[featureName];
		if (cmdId !== undefined) {
			const cmd = this.psm.playing.commandInfo(cmdId);
			if (cmd?.enabled) {
				return { state: FeatureState.Available };
			}
			return { state: FeatureState.Unavailable };
		}

		if (featureName === FeatureName.App) {
			if (this.psm.client) {
				return { state: FeatureState.Available };
			}
			return { state: FeatureState.Unavailable };
		}

		if (
			featureName === FeatureName.VolumeDown ||
			featureName === FeatureName.VolumeUp
		) {
			return { state: FeatureState.Unknown };
		}

		return { state: FeatureState.Unsupported };
	}
}

// --- Scan Handlers ---

export function mrpServiceHandler(
	mdnsService: mdnsTypes.Service,
	_response: mdnsTypes.Response,
): ScanHandlerReturn | null {
	let enabled = true;

	// Disable this service if tvOS version >= 15
	const build = mdnsService.properties.SystemBuildVersion ?? "";
	const match = build.match(/^(\d+)[A-Z]/);
	if (match) {
		const base = Number.parseInt(match[1], 10);
		if (base >= 19) {
			enabled = false;
		}
	}

	const name = mdnsService.properties.Name ?? "Unknown";
	const service = new MutableService(
		getUniqueId(mdnsService.type, mdnsService.name, mdnsService.properties),
		Protocol.MRP,
		mdnsService.port,
		mdnsService.properties,
		undefined,
		undefined,
		enabled,
	);
	return [name, service];
}

export function scan(): Record<string, ScanHandlerDeviceInfoName> {
	return {
		"_mediaremotetv._tcp.local": [
			mrpServiceHandler,
			deviceInfoNameFromUniqueShortName,
		],
	};
}

export function deviceInfo(
	_serviceType: string,
	properties: Record<string, unknown>,
): Record<string, unknown> {
	const devinfo: Record<string, unknown> = {};

	if (properties.systembuildversion || properties.SystemBuildVersion) {
		devinfo[DeviceInfo.BUILD_NUMBER] =
			properties.systembuildversion ?? properties.SystemBuildVersion;
	}

	if (properties.macaddress || properties.MACAddress) {
		devinfo[DeviceInfo.MAC] = properties.macaddress ?? properties.MACAddress;
	}

	devinfo[DeviceInfo.OPERATING_SYSTEM] = OperatingSystem.TvOS;

	return devinfo;
}

export async function serviceInfo(
	service: MutableService,
	_devinfo: DeviceInfo,
	_services: Map<Protocol, BaseService>,
): Promise<void> {
	if (!service.enabled) {
		service.pairing = PairingRequirement.NotNeeded;
	} else if (
		(
			service.properties.allowpairing ??
			service.properties.AllowPairing ??
			"no"
		).toLowerCase() === "yes"
	) {
		service.pairing = PairingRequirement.Optional;
	} else {
		service.pairing = PairingRequirement.Disabled;
	}
}

export function* setup(core: Core): Generator<SetupData> {
	const connection = new MrpConnection(core.config.address, core.service.port);
	const protocol = new MrpProtocol(
		connection,
		new SRPAuthHandler(),
		core.service,
		core.settings.info,
	);
	const psm = new PlayerStateManager(protocol);

	const remoteControl = new MrpRemoteControl(psm, protocol);
	const metadata = new MrpMetadata(core.config.identifier, psm);
	const power = new MrpPower(protocol, remoteControl);
	const pushUpdater = new MrpPushUpdater(metadata, psm, core.stateDispatcher);
	const audio = new MrpAudio(protocol);

	const interfaces = new Map<unknown, unknown>();
	interfaces.set(RemoteControl, remoteControl);
	interfaces.set("Metadata", metadata);
	interfaces.set("Power", power);
	interfaces.set(PushUpdater, pushUpdater);
	interfaces.set(Features, new MrpFeatures(core.config, psm));
	interfaces.set("Audio", audio);

	const connect = async (): Promise<boolean> => {
		await protobuf.loadProtos();
		await protocol.start();
		protocol.enableHeartbeat();
		return true;
	};

	const close = (): Set<Promise<void>> => {
		pushUpdater.stop();
		protocol.stop();
		return new Set();
	};

	const getDeviceInfo = (): Record<string, unknown> => {
		const devinfo = deviceInfo(Object.keys(scan())[0], core.service.properties);

		if (protocol.deviceInfo) {
			const info = protocol.deviceInfo.deviceInfoMessage as
				| Record<string, unknown>
				| undefined;
			if (info) {
				devinfo[DeviceInfo.BUILD_NUMBER] = info.systemBuildVersion;
				if (info.modelID) {
					devinfo[DeviceInfo.RAW_MODEL] = info.modelID;
				}
			}
		}

		return devinfo;
	};

	const features = new Set<FeatureName>([
		FeatureName.Artwork,
		FeatureName.VolumeDown,
		FeatureName.VolumeUp,
		FeatureName.SetVolume,
		FeatureName.Volume,
		FeatureName.App,
	]);
	for (const f of _FEATURES_SUPPORTED) features.add(f);
	for (const f of Object.keys(_FEATURE_COMMAND_MAP).map(Number)) {
		features.add(f as FeatureName);
	}
	for (const f of Object.keys(_FIELD_FEATURES).map(Number)) {
		features.add(f as FeatureName);
	}

	yield {
		protocol: Protocol.MRP,
		connect,
		close,
		deviceInfo: getDeviceInfo,
		interfaces,
		features,
	};
}

export function pair(core: Core): MrpPairingHandler {
	return new MrpPairingHandler(core);
}
