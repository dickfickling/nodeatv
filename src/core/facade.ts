/**
 * Facade multiplexer that aggregates multiple protocol implementations
 * behind a single unified API surface.
 */

import type {
	InputAction,
	KeyboardFocusState,
	PowerState,
	RepeatState,
	ShuffleState,
} from "../const.js";
import { FeatureName, FeatureState, Protocol } from "../const.js";
import { InvalidStateError } from "../exceptions.js";
import {
	type App,
	Apps,
	type ArtworkInfo,
	Audio,
	type BaseConfig,
	type DeviceListener,
	type FeatureInfo,
	Features,
	Keyboard,
	Metadata,
	type OutputDevice,
	type Playing,
	Power,
	PushUpdater,
	RemoteControl,
	Stream,
	TouchGestures,
	type UserAccount,
	UserAccounts,
} from "../interface.js";
import { StateProducer } from "../support/stateProducer.js";
import type { SetupData } from "./core.js";
import { Relayer } from "./relayer.js";

// --- Priority lists ---

const DEFAULT_PRIORITIES: Protocol[] = [
	Protocol.MRP,
	Protocol.DMAP,
	Protocol.Companion,
	Protocol.AirPlay,
	Protocol.RAOP,
];

const POWER_PRIORITIES: Protocol[] = [
	Protocol.Companion,
	Protocol.MRP,
	Protocol.DMAP,
	Protocol.AirPlay,
	Protocol.RAOP,
];

// --- FacadeRemoteControl ---

export class FacadeRemoteControl extends RemoteControl {
	private _relayer: Relayer<RemoteControl>;

	constructor(priorities: Protocol[] = DEFAULT_PRIORITIES) {
		super();
		this._relayer = new Relayer(RemoteControl, priorities);
	}

	get relayer(): Relayer<RemoteControl> {
		return this._relayer;
	}

	override async up(action?: InputAction): Promise<void> {
		return (
			this._relayer.relay("up") as (action?: InputAction) => Promise<void>
		)(action);
	}

	override async down(action?: InputAction): Promise<void> {
		return (
			this._relayer.relay("down") as (action?: InputAction) => Promise<void>
		)(action);
	}

	override async left(action?: InputAction): Promise<void> {
		return (
			this._relayer.relay("left") as (action?: InputAction) => Promise<void>
		)(action);
	}

	override async right(action?: InputAction): Promise<void> {
		return (
			this._relayer.relay("right") as (action?: InputAction) => Promise<void>
		)(action);
	}

	override async play(): Promise<void> {
		return (this._relayer.relay("play") as () => Promise<void>)();
	}

	override async playPause(): Promise<void> {
		return (this._relayer.relay("playPause") as () => Promise<void>)();
	}

	override async pause(): Promise<void> {
		return (this._relayer.relay("pause") as () => Promise<void>)();
	}

	override async stop(): Promise<void> {
		return (this._relayer.relay("stop") as () => Promise<void>)();
	}

	override async next(): Promise<void> {
		return (this._relayer.relay("next") as () => Promise<void>)();
	}

	override async previous(): Promise<void> {
		return (this._relayer.relay("previous") as () => Promise<void>)();
	}

	override async select(action?: InputAction): Promise<void> {
		return (
			this._relayer.relay("select") as (action?: InputAction) => Promise<void>
		)(action);
	}

	override async menu(action?: InputAction): Promise<void> {
		return (
			this._relayer.relay("menu") as (action?: InputAction) => Promise<void>
		)(action);
	}

	override async volumeUp(): Promise<void> {
		return (this._relayer.relay("volumeUp") as () => Promise<void>)();
	}

	override async volumeDown(): Promise<void> {
		return (this._relayer.relay("volumeDown") as () => Promise<void>)();
	}

	override async home(action?: InputAction): Promise<void> {
		return (
			this._relayer.relay("home") as (action?: InputAction) => Promise<void>
		)(action);
	}

	override async homeHold(): Promise<void> {
		return (this._relayer.relay("homeHold") as () => Promise<void>)();
	}

	override async topMenu(): Promise<void> {
		return (this._relayer.relay("topMenu") as () => Promise<void>)();
	}

	override async suspend(): Promise<void> {
		return (this._relayer.relay("suspend") as () => Promise<void>)();
	}

	override async wakeup(): Promise<void> {
		return (this._relayer.relay("wakeup") as () => Promise<void>)();
	}

	override async skipForward(timeInterval?: number): Promise<void> {
		return (
			this._relayer.relay("skipForward") as (t?: number) => Promise<void>
		)(timeInterval);
	}

	override async skipBackward(timeInterval?: number): Promise<void> {
		return (
			this._relayer.relay("skipBackward") as (t?: number) => Promise<void>
		)(timeInterval);
	}

	override async setPosition(pos: number): Promise<void> {
		return (this._relayer.relay("setPosition") as (p: number) => Promise<void>)(
			pos,
		);
	}

	override async setShuffle(shuffleState: ShuffleState): Promise<void> {
		return (
			this._relayer.relay("setShuffle") as (s: ShuffleState) => Promise<void>
		)(shuffleState);
	}

	override async setRepeat(repeatState: RepeatState): Promise<void> {
		return (
			this._relayer.relay("setRepeat") as (r: RepeatState) => Promise<void>
		)(repeatState);
	}

	override async channelUp(): Promise<void> {
		return (this._relayer.relay("channelUp") as () => Promise<void>)();
	}

	override async channelDown(): Promise<void> {
		return (this._relayer.relay("channelDown") as () => Promise<void>)();
	}

	override async screensaver(): Promise<void> {
		return (this._relayer.relay("screensaver") as () => Promise<void>)();
	}

	override async guide(): Promise<void> {
		return (this._relayer.relay("guide") as () => Promise<void>)();
	}

	override async controlCenter(): Promise<void> {
		return (this._relayer.relay("controlCenter") as () => Promise<void>)();
	}
}

// --- FacadeMetadata ---

export class FacadeMetadata extends Metadata {
	private _relayer: Relayer<Metadata>;

	constructor(priorities: Protocol[] = DEFAULT_PRIORITIES) {
		super();
		this._relayer = new Relayer(Metadata, priorities);
	}

	get relayer(): Relayer<Metadata> {
		return this._relayer;
	}

	override get deviceId(): string | null {
		return this._relayer.relay("deviceId") as string | null;
	}

	override async playing(): Promise<Playing> {
		return (this._relayer.relay("playing") as () => Promise<Playing>)();
	}

	override async artwork(
		width?: number | null,
		height?: number | null,
	): Promise<ArtworkInfo | null> {
		return (
			this._relayer.relay("artwork") as (
				w?: number | null,
				h?: number | null,
			) => Promise<ArtworkInfo | null>
		)(width, height);
	}

	override get artworkId(): string | null {
		return this._relayer.relay("artworkId") as string | null;
	}
}

// --- FacadePower ---

export class FacadePower extends Power {
	private _relayer: Relayer<Power>;

	constructor(priorities: Protocol[] = POWER_PRIORITIES) {
		super();
		this._relayer = new Relayer(Power, priorities);
	}

	get relayer(): Relayer<Power> {
		return this._relayer;
	}

	override async turnOn(): Promise<void> {
		return (this._relayer.relay("turnOn") as () => Promise<void>)();
	}

	override async turnOff(): Promise<void> {
		return (this._relayer.relay("turnOff") as () => Promise<void>)();
	}

	override get powerState(): PowerState {
		return this._relayer.relay("powerState") as PowerState;
	}
}

// --- FacadeAudio ---

export class FacadeAudio extends Audio {
	private _relayer: Relayer<Audio>;

	constructor(priorities: Protocol[] = DEFAULT_PRIORITIES) {
		super();
		this._relayer = new Relayer(Audio, priorities);
	}

	get relayer(): Relayer<Audio> {
		return this._relayer;
	}

	override get volume(): number {
		return this._relayer.relay("volume") as number;
	}

	override async setVolume(level: number): Promise<void> {
		return (this._relayer.relay("setVolume") as (l: number) => Promise<void>)(
			level,
		);
	}

	override async volumeUp(): Promise<void> {
		return (this._relayer.relay("volumeUp") as () => Promise<void>)();
	}

	override async volumeDown(): Promise<void> {
		return (this._relayer.relay("volumeDown") as () => Promise<void>)();
	}

	override async addOutputDevices(...devices: string[]): Promise<void> {
		return (
			this._relayer.relay("addOutputDevices") as (
				...d: string[]
			) => Promise<void>
		)(...devices);
	}

	override async removeOutputDevices(...devices: string[]): Promise<void> {
		return (
			this._relayer.relay("removeOutputDevices") as (
				...d: string[]
			) => Promise<void>
		)(...devices);
	}

	override async setOutputDevices(...devices: string[]): Promise<void> {
		return (
			this._relayer.relay("setOutputDevices") as (
				...d: string[]
			) => Promise<void>
		)(...devices);
	}

	override get outputDevices(): OutputDevice[] {
		return this._relayer.relay("outputDevices") as OutputDevice[];
	}
}

// --- FacadeApps ---

export class FacadeApps extends Apps {
	private _relayer: Relayer<Apps>;

	constructor(priorities: Protocol[] = DEFAULT_PRIORITIES) {
		super();
		this._relayer = new Relayer(Apps, priorities);
	}

	get relayer(): Relayer<Apps> {
		return this._relayer;
	}

	override async appList(): Promise<App[]> {
		return (this._relayer.relay("appList") as () => Promise<App[]>)();
	}

	override async launchApp(bundleIdOrUrl: string): Promise<void> {
		return (this._relayer.relay("launchApp") as (b: string) => Promise<void>)(
			bundleIdOrUrl,
		);
	}
}

// --- FacadeUserAccounts ---

export class FacadeUserAccounts extends UserAccounts {
	private _relayer: Relayer<UserAccounts>;

	constructor(priorities: Protocol[] = DEFAULT_PRIORITIES) {
		super();
		this._relayer = new Relayer(UserAccounts, priorities);
	}

	get relayer(): Relayer<UserAccounts> {
		return this._relayer;
	}

	override async accountList(): Promise<UserAccount[]> {
		return (
			this._relayer.relay("accountList") as () => Promise<UserAccount[]>
		)();
	}

	override async switchAccount(accountId: string): Promise<void> {
		return (
			this._relayer.relay("switchAccount") as (a: string) => Promise<void>
		)(accountId);
	}
}

// --- FacadeKeyboard ---

export class FacadeKeyboard extends Keyboard {
	private _relayer: Relayer<Keyboard>;

	constructor(priorities: Protocol[] = DEFAULT_PRIORITIES) {
		super();
		this._relayer = new Relayer(Keyboard, priorities);
	}

	get relayer(): Relayer<Keyboard> {
		return this._relayer;
	}

	override get textFocusState(): KeyboardFocusState {
		return this._relayer.relay("textFocusState") as KeyboardFocusState;
	}

	override async textGet(): Promise<string | null> {
		return (this._relayer.relay("textGet") as () => Promise<string | null>)();
	}

	override async textClear(): Promise<void> {
		return (this._relayer.relay("textClear") as () => Promise<void>)();
	}

	override async textAppend(text: string): Promise<void> {
		return (this._relayer.relay("textAppend") as (t: string) => Promise<void>)(
			text,
		);
	}

	override async textSet(text: string): Promise<void> {
		return (this._relayer.relay("textSet") as (t: string) => Promise<void>)(
			text,
		);
	}
}

// --- FacadeTouchGestures ---

export class FacadeTouchGestures extends TouchGestures {
	private _relayer: Relayer<TouchGestures>;

	constructor(priorities: Protocol[] = DEFAULT_PRIORITIES) {
		super();
		this._relayer = new Relayer(TouchGestures, priorities);
	}

	get relayer(): Relayer<TouchGestures> {
		return this._relayer;
	}

	override async swipe(
		startX: number,
		startY: number,
		endX: number,
		endY: number,
		durationMs: number,
	): Promise<void> {
		return (
			this._relayer.relay("swipe") as (
				sx: number,
				sy: number,
				ex: number,
				ey: number,
				d: number,
			) => Promise<void>
		)(startX, startY, endX, endY, durationMs);
	}

	override async action(x: number, y: number, mode: number): Promise<void> {
		return (
			this._relayer.relay("action") as (
				x: number,
				y: number,
				m: number,
			) => Promise<void>
		)(x, y, mode);
	}

	override async click(clickAction: InputAction): Promise<void> {
		return (this._relayer.relay("click") as (a: InputAction) => Promise<void>)(
			clickAction,
		);
	}
}

// --- FacadeStream ---

export class FacadeStream extends Stream {
	private _relayer: Relayer<Stream>;

	constructor(priorities: Protocol[] = DEFAULT_PRIORITIES) {
		super();
		this._relayer = new Relayer(Stream, priorities);
	}

	get relayer(): Relayer<Stream> {
		return this._relayer;
	}

	override async playUrl(
		url: string,
		options?: Record<string, unknown>,
	): Promise<void> {
		return (
			this._relayer.relay("playUrl") as (
				u: string,
				o?: Record<string, unknown>,
			) => Promise<void>
		)(url, options);
	}

	override stop(): void {
		(this._relayer.relay("stop") as () => void)();
	}

	override close(): void {
		(this._relayer.relay("close") as () => void)();
	}
}

// --- FacadeFeatures ---

export class FacadeFeatures extends Features {
	private _featureMap: Map<FeatureName, Features> = new Map();
	private _allFeatures: Map<Protocol, Features> = new Map();

	register(features: Features, protocol: Protocol): void {
		this._allFeatures.set(protocol, features);
		this._rebuildFeatureMap();
	}

	private _rebuildFeatureMap(): void {
		this._featureMap.clear();
		for (const name of Object.values(FeatureName)) {
			if (typeof name !== "number") continue;
			const fn = name as FeatureName;
			for (const [, features] of this._allFeatures) {
				const info = features.getFeature(fn);
				if (info.state !== FeatureState.Unsupported) {
					this._featureMap.set(fn, features);
					break;
				}
			}
		}
	}

	override getFeature(featureName: FeatureName): FeatureInfo {
		const features = this._featureMap.get(featureName);
		if (features) {
			return features.getFeature(featureName);
		}
		return { state: FeatureState.Unsupported };
	}
}

// --- FacadePushUpdater ---

export class FacadePushUpdater extends PushUpdater {
	private _updaters: Map<Protocol, PushUpdater> = new Map();
	private _active = false;

	register(updater: PushUpdater, protocol: Protocol): void {
		this._updaters.set(protocol, updater);
	}

	get active(): boolean {
		return this._active;
	}

	start(initialDelay = 0): void {
		this._active = true;
		for (const updater of this._updaters.values()) {
			try {
				updater.start(initialDelay);
			} catch {
				// Some updaters may not support starting
			}
		}
	}

	stop(): void {
		this._active = false;
		for (const updater of this._updaters.values()) {
			try {
				updater.stop();
			} catch {
				// Some updaters may not support stopping
			}
		}
	}
}

// --- Interface key constants ---

const INTERFACE_KEYS = {
	RemoteControl,
	Metadata: "Metadata",
	Power: "Power",
	Audio: "Audio",
	Apps: "Apps",
	UserAccounts: "UserAccounts",
	Keyboard: "Keyboard",
	TouchGestures: "TouchGestures",
	Stream: "Stream",
	Features,
	PushUpdater,
} as const;

// --- FacadeAppleTV ---

export class FacadeAppleTV {
	private _config: BaseConfig;
	private _setupData: SetupData[] = [];
	private _connected = false;
	private _closed = false;

	readonly remoteControl: FacadeRemoteControl;
	readonly metadata: FacadeMetadata;
	readonly power: FacadePower;
	readonly audio: FacadeAudio;
	readonly apps: FacadeApps;
	readonly userAccounts: FacadeUserAccounts;
	readonly keyboard: FacadeKeyboard;
	readonly touchGestures: FacadeTouchGestures;
	readonly stream: FacadeStream;
	readonly features: FacadeFeatures;
	readonly pushUpdater: FacadePushUpdater;
	readonly deviceListener: StateProducer<DeviceListener>;

	constructor(config: BaseConfig) {
		this._config = config;
		this.remoteControl = new FacadeRemoteControl();
		this.metadata = new FacadeMetadata();
		this.power = new FacadePower();
		this.audio = new FacadeAudio();
		this.apps = new FacadeApps();
		this.userAccounts = new FacadeUserAccounts();
		this.keyboard = new FacadeKeyboard();
		this.touchGestures = new FacadeTouchGestures();
		this.stream = new FacadeStream();
		this.features = new FacadeFeatures();
		this.pushUpdater = new FacadePushUpdater();
		this.deviceListener = new StateProducer<DeviceListener>();
	}

	get config(): BaseConfig {
		return this._config;
	}

	get name(): string {
		return this._config.name;
	}

	get address(): string {
		return this._config.address;
	}

	addSetupData(data: SetupData): void {
		if (this._closed) {
			throw new InvalidStateError("device is closed");
		}
		this._setupData.push(data);
	}

	async connect(): Promise<void> {
		if (this._closed) {
			throw new InvalidStateError("device is closed");
		}
		if (this._connected) {
			throw new InvalidStateError("already connected");
		}

		for (const data of this._setupData) {
			const connected = await data.connect();
			if (!connected) continue;

			const protocol = data.protocol;

			// Register interfaces from the setup data
			const rc = data.interfaces.get(INTERFACE_KEYS.RemoteControl);
			if (rc) {
				this.remoteControl.relayer.register(rc as RemoteControl, protocol);
			}

			const meta = data.interfaces.get(INTERFACE_KEYS.Metadata);
			if (meta) {
				this.metadata.relayer.register(meta as Metadata, protocol);
			}

			const pwr = data.interfaces.get(INTERFACE_KEYS.Power);
			if (pwr) {
				this.power.relayer.register(pwr as Power, protocol);
			}

			const aud = data.interfaces.get(INTERFACE_KEYS.Audio);
			if (aud) {
				this.audio.relayer.register(aud as Audio, protocol);
			}

			const appsImpl = data.interfaces.get(INTERFACE_KEYS.Apps);
			if (appsImpl) {
				this.apps.relayer.register(appsImpl as Apps, protocol);
			}

			const ua = data.interfaces.get(INTERFACE_KEYS.UserAccounts);
			if (ua) {
				this.userAccounts.relayer.register(ua as UserAccounts, protocol);
			}

			const kb = data.interfaces.get(INTERFACE_KEYS.Keyboard);
			if (kb) {
				this.keyboard.relayer.register(kb as Keyboard, protocol);
			}

			const tg = data.interfaces.get(INTERFACE_KEYS.TouchGestures);
			if (tg) {
				this.touchGestures.relayer.register(tg as TouchGestures, protocol);
			}

			const strm = data.interfaces.get(INTERFACE_KEYS.Stream);
			if (strm) {
				this.stream.relayer.register(strm as Stream, protocol);
			}

			const feat = data.interfaces.get(INTERFACE_KEYS.Features);
			if (feat) {
				this.features.register(feat as Features, protocol);
			}

			const pu = data.interfaces.get(INTERFACE_KEYS.PushUpdater);
			if (pu) {
				this.pushUpdater.register(pu as PushUpdater, protocol);
			}
		}

		this._connected = true;
	}

	async close(): Promise<void> {
		if (this._closed) return;
		this._closed = true;

		// Stop push updater
		try {
			this.pushUpdater.stop();
		} catch {
			// ignore
		}

		// Close all setup data sessions
		const allPromises: Promise<void>[] = [];
		for (const data of this._setupData) {
			try {
				const promises = data.close();
				for (const p of promises) {
					allPromises.push(p);
				}
			} catch {
				// ignore close errors
			}
		}

		await Promise.allSettled(allPromises);
		this._setupData = [];
	}

	takeover(protocol: Protocol): () => void {
		this.remoteControl.relayer.takeover(protocol);
		this.metadata.relayer.takeover(protocol);
		this.power.relayer.takeover(protocol);
		this.audio.relayer.takeover(protocol);

		return () => {
			this.remoteControl.relayer.release();
			this.metadata.relayer.release();
			this.power.relayer.release();
			this.audio.relayer.release();
		};
	}
}
