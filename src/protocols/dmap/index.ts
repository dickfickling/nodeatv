/**
 * Implementation of the DMAP protocol used by Apple TV 1, 2, and 3.
 */

import {
	DeviceModel,
	type DeviceState,
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
import * as exceptions from "../../exceptions.js";
import { getUniqueId } from "../../helpers.js";
import type { BaseConfig, BaseService } from "../../interface.js";
import {
	type ArtworkInfo,
	DeviceInfo,
	type FeatureInfo,
	Features,
	Playing as PlayingClass,
	PushUpdater,
	RemoteControl,
} from "../../interface.js";
import { Cache } from "../../support/cache.js";
import { HttpSession } from "../../support/http.js";
import * as daap from "./daap.js";
import { DaapRequester } from "./daap.js";
import { DmapPairingHandler } from "./pairing.js";
import * as parser from "./parser.js";
import * as tags from "./tags.js";

const _DEFAULT_SKIP_TIME = 10;

const _PSU_CMD = "ctrl-int/1/playstatusupdate?[AUTH]&revision-number={0}";
const _ARTWORK_CMD =
	"ctrl-int/1/nowplayingartwork?mw={width}&mh={height}&[AUTH]";
const _CTRL_PROMPT_CMD = "ctrl-int/1/controlpromptentry?[AUTH]&prompt-id=0";

const _AVAILABLE_FEATURES: FeatureName[] = [
	FeatureName.Down,
	FeatureName.Left,
	FeatureName.Menu,
	FeatureName.Right,
	FeatureName.Select,
	FeatureName.TopMenu,
	FeatureName.Up,
];

const _UNKNOWN_FEATURES: FeatureName[] = [
	FeatureName.Artwork,
	FeatureName.Next,
	FeatureName.Pause,
	FeatureName.Play,
	FeatureName.PlayPause,
	FeatureName.Previous,
	FeatureName.SetPosition,
	FeatureName.SetRepeat,
	FeatureName.SetShuffle,
	FeatureName.Stop,
	FeatureName.SkipForward,
	FeatureName.SkipBackward,
];

const _FIELD_FEATURES: Record<number, [string, string]> = {
	[FeatureName.Title]: ["cmst", "caps"],
	[FeatureName.Artist]: ["cmst", "cann"],
	[FeatureName.Album]: ["cmst", "canl"],
	[FeatureName.Genre]: ["cmst", "cang"],
	[FeatureName.TotalTime]: ["cmst", "cast"],
	[FeatureName.Position]: ["cmst", "cant"],
	[FeatureName.Shuffle]: ["cmst", "cash"],
	[FeatureName.Repeat]: ["cmst", "carp"],
};

// --- buildPlayingInstance ---

export function buildPlayingInstance(playstatus: unknown): PlayingClass {
	function getTimeInSeconds(tag: string): number {
		const time = parser.first(playstatus, "cmst", tag) as number | null;
		return daap.msToS(time);
	}

	function getMediaType(): MediaType {
		const state = parser.first(playstatus, "cmst", "caps");
		if (!state) return MediaType.Unknown;

		const mediakind = parser.first(playstatus, "cmst", "cmmk") as number | null;
		if (mediakind !== null && mediakind !== undefined) {
			return daap.mediaKind(mediakind);
		}

		if (getArtist() || getAlbum()) return MediaType.Music;
		return MediaType.Video;
	}

	function getDeviceState(): DeviceState {
		const state = parser.first(playstatus, "cmst", "caps") as number | null;
		return daap.playstate(state);
	}

	function getTitle(): string | null {
		return (parser.first(playstatus, "cmst", "cann") as string) ?? null;
	}

	function getArtist(): string | null {
		return (parser.first(playstatus, "cmst", "cana") as string) ?? null;
	}

	function getAlbum(): string | null {
		return (parser.first(playstatus, "cmst", "canl") as string) ?? null;
	}

	function getGenre(): string | null {
		return (parser.first(playstatus, "cmst", "cang") as string) ?? null;
	}

	function getTotalTime(): number | null {
		const t = getTimeInSeconds("cast");
		return t || null;
	}

	function getPosition(): number | null {
		const total = getTotalTime();
		const remaining = getTimeInSeconds("cant");
		if (!total || !remaining) return null;
		return total - remaining;
	}

	function getShuffle(): ShuffleState {
		const state = parser.first(playstatus, "cmst", "cash") as number | null;
		if (state === null || state === undefined || state === 0) {
			return ShuffleState.Off;
		}
		return ShuffleState.Songs;
	}

	function getRepeat(): RepeatState {
		const state = parser.first(playstatus, "cmst", "carp") as number | null;
		if (state === null || state === undefined) return RepeatState.Off;
		return state as RepeatState;
	}

	return new PlayingClass({
		mediaType: getMediaType(),
		deviceState: getDeviceState(),
		title: getTitle(),
		artist: getArtist(),
		album: getAlbum(),
		genre: getGenre(),
		totalTime: getTotalTime(),
		position: getPosition(),
		shuffle: getShuffle(),
		repeat: getRepeat(),
	});
}

// --- BaseDmapAppleTV ---

export class BaseDmapAppleTV {
	daap: DaapRequester;
	playstatusRevision = 0;
	latestPlaystatus: unknown = null;
	latestPlaying: PlayingClass | null = null;
	latestHash: string | null = null;

	constructor(requester: DaapRequester) {
		this.daap = requester;
	}

	async playstatus(
		useRevision = false,
		timeout?: number,
	): Promise<PlayingClass> {
		const cmdUrl = _PSU_CMD.replace(
			"{0}",
			String(useRevision ? this.playstatusRevision : 0),
		);
		const resp = await this.daap.get(cmdUrl, true, timeout);
		this.playstatusRevision = parser.first(resp, "cmst", "cmsr") as number;
		this.latestPlaystatus = resp;
		this.latestPlaying = buildPlayingInstance(resp);
		this.latestHash = this.latestPlaying.hash;
		return this.latestPlaying;
	}

	async artwork(
		width: number | null,
		height: number | null,
	): Promise<Buffer | null> {
		const url = _ARTWORK_CMD
			.replace("{width}", String(width ?? 0))
			.replace("{height}", String(height ?? 0));
		const art = (await this.daap.get(url, false)) as Buffer;
		return art && art.length > 0 ? art : null;
	}

	ctrlIntCmd(cmd: string): Promise<unknown> {
		return this.daap.post(`ctrl-int/1/${cmd}?[AUTH]&prompt-id=0`);
	}

	controlpromptCmd(cmd: string): Promise<unknown> {
		const data = Buffer.concat([
			tags.stringTag("cmbe", cmd),
			tags.uint8Tag("cmcc", 0),
		]);
		return this.daap.post(_CTRL_PROMPT_CMD, data);
	}

	controlpromptData(data: Buffer): Promise<unknown> {
		return this.daap.post(_CTRL_PROMPT_CMD, data);
	}

	setProperty(prop: string, value: number): Promise<unknown> {
		return this.daap.post(`ctrl-int/1/setproperty?${prop}=${value}&[AUTH]`);
	}
}

// --- DmapRemoteControl ---

export class DmapRemoteControl extends RemoteControl {
	private appleTv: BaseDmapAppleTV;

	constructor(appleTv: BaseDmapAppleTV) {
		super();
		this.appleTv = appleTv;
	}

	async up(_action: InputAction = InputAction.SingleTap): Promise<void> {
		await this._sendCommands(
			DmapRemoteControl._move("Down", 0, 20, 275),
			DmapRemoteControl._move("Move", 1, 20, 270),
			DmapRemoteControl._move("Move", 2, 20, 265),
			DmapRemoteControl._move("Move", 3, 20, 260),
			DmapRemoteControl._move("Move", 4, 20, 255),
			DmapRemoteControl._move("Move", 5, 20, 250),
			DmapRemoteControl._move("Up", 6, 20, 250),
		);
	}

	async down(_action: InputAction = InputAction.SingleTap): Promise<void> {
		await this._sendCommands(
			DmapRemoteControl._move("Down", 0, 20, 250),
			DmapRemoteControl._move("Move", 1, 20, 255),
			DmapRemoteControl._move("Move", 2, 20, 260),
			DmapRemoteControl._move("Move", 3, 20, 265),
			DmapRemoteControl._move("Move", 4, 20, 270),
			DmapRemoteControl._move("Move", 5, 20, 275),
			DmapRemoteControl._move("Up", 6, 20, 275),
		);
	}

	async left(_action: InputAction = InputAction.SingleTap): Promise<void> {
		await this._sendCommands(
			DmapRemoteControl._move("Down", 0, 75, 100),
			DmapRemoteControl._move("Move", 1, 70, 100),
			DmapRemoteControl._move("Move", 3, 65, 100),
			DmapRemoteControl._move("Move", 4, 60, 100),
			DmapRemoteControl._move("Move", 5, 55, 100),
			DmapRemoteControl._move("Move", 6, 50, 100),
			DmapRemoteControl._move("Up", 7, 50, 100),
		);
	}

	async right(_action: InputAction = InputAction.SingleTap): Promise<void> {
		await this._sendCommands(
			DmapRemoteControl._move("Down", 0, 50, 100),
			DmapRemoteControl._move("Move", 1, 55, 100),
			DmapRemoteControl._move("Move", 3, 60, 100),
			DmapRemoteControl._move("Move", 4, 65, 100),
			DmapRemoteControl._move("Move", 5, 70, 100),
			DmapRemoteControl._move("Move", 6, 75, 100),
			DmapRemoteControl._move("Up", 7, 75, 100),
		);
	}

	private static _move(
		direction: string,
		time: number,
		point1: number,
		point2: number,
	): Buffer {
		const data = `touch${direction}&time=${time}&point=${point1},${point2}`;
		return Buffer.concat([
			tags.uint8Tag("cmcc", 0x30),
			tags.stringTag("cmbe", data),
		]);
	}

	private async _sendCommands(...cmds: Buffer[]): Promise<void> {
		for (const cmd of cmds) {
			await this.appleTv.controlpromptData(cmd);
		}
	}

	async play(): Promise<void> {
		await this.appleTv.ctrlIntCmd("play");
	}

	async playPause(): Promise<void> {
		await this.appleTv.ctrlIntCmd("playpause");
	}

	async pause(): Promise<void> {
		await this.appleTv.ctrlIntCmd("pause");
	}

	async stop(): Promise<void> {
		await this.appleTv.ctrlIntCmd("stop");
	}

	async next(): Promise<void> {
		await this.appleTv.ctrlIntCmd("nextitem");
	}

	async previous(): Promise<void> {
		await this.appleTv.ctrlIntCmd("previtem");
	}

	async select(_action: InputAction = InputAction.SingleTap): Promise<void> {
		await this.appleTv.controlpromptCmd("select");
	}

	async menu(_action: InputAction = InputAction.SingleTap): Promise<void> {
		await this.appleTv.controlpromptCmd("menu");
	}

	async topMenu(): Promise<void> {
		await this.appleTv.controlpromptCmd("topmenu");
	}

	async volumeUp(): Promise<void> {
		await this.appleTv.ctrlIntCmd("volumeup");
	}

	async volumeDown(): Promise<void> {
		await this.appleTv.ctrlIntCmd("volumedown");
	}

	async skipForward(timeInterval = 0.0): Promise<void> {
		const current = await this.appleTv.playstatus();
		if (current.position) {
			await this.setPosition(
				current.position +
					(timeInterval > 0 ? Math.floor(timeInterval) : _DEFAULT_SKIP_TIME),
			);
		}
	}

	async skipBackward(timeInterval = 0.0): Promise<void> {
		const current = await this.appleTv.playstatus();
		if (current.position) {
			await this.setPosition(
				current.position -
					(timeInterval > 0 ? Math.floor(timeInterval) : _DEFAULT_SKIP_TIME),
			);
		}
	}

	async setPosition(pos: number): Promise<void> {
		const timeInMs = Math.floor(pos) * 1000;
		await this.appleTv.setProperty("dacp.playingtime", timeInMs);
	}

	async setShuffle(shuffleState: ShuffleState): Promise<void> {
		const state = shuffleState === ShuffleState.Off ? 0 : 1;
		await this.appleTv.setProperty("dacp.shufflestate", state);
	}

	async setRepeat(repeatState: RepeatState): Promise<void> {
		await this.appleTv.setProperty("dacp.repeatstate", repeatState);
	}
}

// --- DmapMetadata ---

export class DmapMetadata {
	identifier: string | null;
	private appleTv: BaseDmapAppleTV;
	private artworkCache: Cache<ArtworkInfo>;

	constructor(identifier: string | null, appleTv: BaseDmapAppleTV) {
		this.identifier = identifier;
		this.appleTv = appleTv;
		this.artworkCache = new Cache<ArtworkInfo>(4);
	}

	get deviceId(): string | null {
		return this.identifier;
	}

	async artwork(
		width: number | null = 512,
		height: number | null = null,
	): Promise<ArtworkInfo | null> {
		const playing = await this.playing();
		const id = playing.hash;

		const cached = this.artworkCache.get(id);
		if (cached) return cached;

		const art = await this.appleTv.artwork(width, height);
		if (art) {
			const info: ArtworkInfo = {
				bytes: art,
				mimetype: "image/png",
				width: -1,
				height: -1,
			};
			this.artworkCache.put(id, info);
			return info;
		}

		return null;
	}

	get artworkId(): string | null {
		return this.appleTv.latestHash;
	}

	async playing(): Promise<PlayingClass> {
		return this.appleTv.playstatus();
	}
}

// --- DmapPushUpdater ---

export class DmapPushUpdater extends AbstractPushUpdater {
	private _atv: BaseDmapAppleTV;
	private _listener: WeakRef<{ listener: { connectionLost(ex: Error): void } }>;
	private _running = false;
	private _abortController: AbortController | null = null;
	private _initialDelay = 0;

	constructor(
		appleTv: BaseDmapAppleTV,
		stateDispatcher: ProtocolStateDispatcher,
		listener: { listener: { connectionLost(ex: Error): void } },
	) {
		super(stateDispatcher);
		this._atv = appleTv;
		this._listener = new WeakRef(listener);
	}

	get active(): boolean {
		return this._running;
	}

	start(initialDelay = 0): void {
		if (this.listener === null) {
			throw new exceptions.NoAsyncListenerError();
		}
		if (this.active) return;

		this._atv.playstatusRevision = 0;
		this._initialDelay = initialDelay;
		this._running = true;
		this._abortController = new AbortController();
		this._poller();
	}

	stop(): void {
		if (this._abortController) {
			this._abortController.abort();
			this._abortController = null;
		}
		this._running = false;
	}

	private async _poller(): Promise<void> {
		let firstCall = true;

		while (this._running) {
			try {
				if (!firstCall && this._initialDelay > 0) {
					await new Promise<void>((resolve, reject) => {
						const timer = setTimeout(resolve, this._initialDelay * 1000);
						this._abortController?.signal.addEventListener("abort", () => {
							clearTimeout(timer);
							reject(new Error("aborted"));
						});
					});
				}
				firstCall = false;

				const playing = await this._atv.playstatus(true, 0);
				this.postUpdate(playing);
			} catch (ex) {
				if (!this._running) break;

				if (ex instanceof Error && ex.message.includes("connection")) {
					const ref = this._listener.deref();
					if (ref) {
						ref.listener.connectionLost(ex);
					}
					break;
				}

				this._atv.playstatusRevision = 0;
				if (this.listener) {
					this.listener.playstatusError(this, ex as Error);
				}
			}
		}

		this._running = false;
	}
}

// --- DmapFeatures ---

export class DmapFeatures extends Features {
	private appleTv: BaseDmapAppleTV;

	constructor(_config: BaseConfig, appleTv: BaseDmapAppleTV) {
		super();
		this.appleTv = appleTv;
	}

	getFeature(featureName: FeatureName): FeatureInfo {
		if (_AVAILABLE_FEATURES.includes(featureName)) {
			return { state: FeatureState.Available };
		}
		if (_UNKNOWN_FEATURES.includes(featureName)) {
			return { state: FeatureState.Unknown };
		}
		if (featureName in _FIELD_FEATURES) {
			return {
				state: this._isAvailable(_FIELD_FEATURES[featureName]),
			};
		}
		if (
			featureName === FeatureName.VolumeUp ||
			featureName === FeatureName.VolumeDown
		) {
			return {
				state: this._isAvailable(["cmst", "cavc"], true),
			};
		}

		return { state: FeatureState.Unsupported };
	}

	private _isAvailable(
		field: [string, string],
		expectedValue?: unknown,
	): FeatureState {
		if (this.appleTv.latestPlaystatus) {
			const value = parser.first(this.appleTv.latestPlaystatus, ...field);
			if (value !== null && value !== undefined) {
				if (expectedValue === undefined || expectedValue === value) {
					return FeatureState.Available;
				}
			}
		}
		return FeatureState.Unavailable;
	}
}

// --- DmapAudio ---

export class DmapAudio {
	private appleTv: BaseDmapAppleTV;

	constructor(appleTv: BaseDmapAppleTV) {
		this.appleTv = appleTv;
	}

	async volumeUp(): Promise<void> {
		await this.appleTv.ctrlIntCmd("volumeup");
	}

	async volumeDown(): Promise<void> {
		await this.appleTv.ctrlIntCmd("volumedown");
	}
}

// --- Scan Handlers ---

export function homesharingServiceHandler(
	mdnsService: mdnsTypes.Service,
	_response: mdnsTypes.Response,
): ScanHandlerReturn | null {
	const name = mdnsService.properties.Name ?? "Unknown";
	const service = new MutableService(
		getUniqueId(mdnsService.type, mdnsService.name, mdnsService.properties),
		Protocol.DMAP,
		mdnsService.port,
		mdnsService.properties,
	);
	service.credentials = mdnsService.properties.hG ?? null;
	return [name, service];
}

export function dmapServiceHandler(
	mdnsService: mdnsTypes.Service,
	_response: mdnsTypes.Response,
): ScanHandlerReturn | null {
	const name = mdnsService.properties.CtlN ?? "Unknown";
	const service = new MutableService(
		getUniqueId(mdnsService.type, mdnsService.name, mdnsService.properties),
		Protocol.DMAP,
		mdnsService.port,
		mdnsService.properties,
	);
	return [name, service];
}

export function hscpServiceHandler(
	mdnsService: mdnsTypes.Service,
	_response: mdnsTypes.Response,
): ScanHandlerReturn | null {
	const name = mdnsService.properties["Machine Name"] ?? "Unknown";
	const service = new MutableService(
		getUniqueId(mdnsService.type, mdnsService.name, mdnsService.properties),
		Protocol.DMAP,
		mdnsService.port,
		mdnsService.properties,
	);
	service.credentials = mdnsService.properties.hG ?? null;
	return [name, service];
}

// --- Protocol Methods ---

export function scan(): Record<string, ScanHandlerDeviceInfoName> {
	return {
		"_appletv-v2._tcp.local": [homesharingServiceHandler, () => null],
		"_touch-able._tcp.local": [dmapServiceHandler, () => null],
		"_hscp._tcp.local": [hscpServiceHandler, () => null],
	};
}

export function deviceInfo(
	serviceType: string,
	_properties: Record<string, unknown>,
): Record<string, unknown> {
	const devinfo: Record<string, unknown> = {};
	devinfo[DeviceInfo.OPERATING_SYSTEM] = OperatingSystem.Legacy;

	if (serviceType === "_hscp._tcp.local") {
		devinfo[DeviceInfo.MODEL] = DeviceModel.Music;
	}

	return devinfo;
}

export async function serviceInfo(
	service: MutableService,
	_devinfo: DeviceInfo,
	_services: Map<Protocol, BaseService>,
): Promise<void> {
	service.pairing =
		"hg" in service.properties || "hG" in service.properties
			? PairingRequirement.Optional
			: PairingRequirement.Mandatory;
}

export function* setup(core: Core): Generator<SetupData> {
	const daapHttp = new HttpSession(
		`http://${core.config.address}:${core.service.port}/`,
	);
	const requester = new DaapRequester(daapHttp, core.service.credentials ?? "");
	const appleTv = new BaseDmapAppleTV(requester);
	const pushUpdater = new DmapPushUpdater(
		appleTv,
		core.stateDispatcher,
		core.deviceListener as { listener: { connectionLost(ex: Error): void } },
	);
	const metadata = new DmapMetadata(core.config.identifier, appleTv);
	const audio = new DmapAudio(appleTv);

	const interfaces = new Map<unknown, unknown>();
	interfaces.set(RemoteControl, new DmapRemoteControl(appleTv));
	interfaces.set("Metadata", metadata);
	interfaces.set(PushUpdater, pushUpdater);
	interfaces.set(Features, new DmapFeatures(core.config, appleTv));
	interfaces.set("Audio", audio);

	const connect = async (): Promise<boolean> => {
		await requester.login();
		await appleTv.playstatus();
		return true;
	};

	const close = (): Set<Promise<void>> => {
		pushUpdater.stop();
		return new Set();
	};

	const getDeviceInfo = (): Record<string, unknown> => {
		const devinfo: Record<string, unknown> = {};
		for (const serviceType of Object.keys(scan())) {
			if (serviceType in core.config.properties) {
				Object.assign(
					devinfo,
					deviceInfo(serviceType, core.config.properties[serviceType]),
				);
			}
		}
		return devinfo;
	};

	const features = new Set<FeatureName>([
		FeatureName.VolumeDown,
		FeatureName.VolumeUp,
	]);
	for (const f of _AVAILABLE_FEATURES) features.add(f);
	for (const f of _UNKNOWN_FEATURES) features.add(f);
	for (const f of Object.keys(_FIELD_FEATURES).map(Number)) {
		features.add(f as FeatureName);
	}

	yield {
		protocol: Protocol.DMAP,
		connect,
		close,
		deviceInfo: getDeviceInfo,
		interfaces,
		features,
	};
}

export function pair(
	core: Core,
	options?: Record<string, unknown>,
): DmapPairingHandler {
	return new DmapPairingHandler(core, options);
}
