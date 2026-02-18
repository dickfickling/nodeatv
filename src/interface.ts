import { createHash } from "node:crypto";
import {
	DeviceModel,
	DeviceState,
	FeatureName,
	FeatureState,
	InputAction,
	type KeyboardFocusState,
	MediaType,
	OperatingSystem,
	type PairingRequirement,
	type PowerState,
	PairingRequirement as PR,
	Protocol,
	type RepeatState,
	type ShuffleState,
} from "./const.js";
import * as convert from "./convert.js";
import * as exceptions from "./exceptions.js";
import type { Settings } from "./settings.js";
import { StateProducer } from "./support/stateProducer.js";

// Feature registry: index -> [name, doc]
const _ALL_FEATURES: Map<number, [string, string]> = new Map();

export function registerFeature(
	index: number,
	name: string,
	doc: string,
): void {
	const existing = _ALL_FEATURES.get(index);
	if (existing && existing[0] !== name) {
		throw new Error(`Index ${index} collides between ${name} and ${existing}`);
	}
	_ALL_FEATURES.set(index, [name, doc]);
}

export function getAllFeatures(): Map<number, [string, string]> {
	return _ALL_FEATURES;
}

export interface ArtworkInfo {
	bytes: Buffer;
	mimetype: string;
	width: number;
	height: number;
}

export interface MediaMetadata {
	title?: string | null;
	artist?: string | null;
	album?: string | null;
	artwork?: Buffer | null;
	duration?: number | null;
}

export interface FeatureInfo {
	state: FeatureState;
	options?: Record<string, unknown>;
}

export abstract class BaseService {
	private _identifier: string | null;
	private _protocol: Protocol;
	private _port: number;
	private _properties: Record<string, string>;
	private _enabled: boolean;
	credentials: string | null;
	password: string | null;

	constructor(
		identifier: string | null,
		protocol: Protocol,
		port: number,
		properties?: Record<string, string> | null,
		credentials?: string | null,
		password?: string | null,
		enabled = true,
	) {
		this._identifier = identifier;
		this._protocol = protocol;
		this._port = port;
		this._properties = { ...(properties ?? {}) };
		this._enabled = enabled;
		this.credentials = credentials ?? null;
		this.password = password ?? null;
	}

	get identifier(): string | null {
		return this._identifier;
	}

	get protocol(): Protocol {
		return this._protocol;
	}

	get port(): number {
		return this._port;
	}

	get enabled(): boolean {
		return this._enabled;
	}

	set enabled(value: boolean) {
		this._enabled = value;
	}

	abstract get requiresPassword(): boolean;
	abstract get pairing(): PairingRequirement;

	get properties(): Record<string, string> {
		return this._properties;
	}

	merge(other: BaseService): void {
		this.credentials = other.credentials || this.credentials;
		this.password = other.password || this.password;
		Object.assign(this._properties, other.properties);
	}

	settings(): Record<string, unknown> {
		return {
			credentials: this.credentials,
			password: this.password,
		};
	}

	apply(settings: Record<string, unknown>): void {
		this.credentials = (settings.credentials as string) || this.credentials;
		this.password = (settings.password as string) || this.password;
	}

	toString(): string {
		const pairingName: Record<number, string> = {
			[PR.Unsupported]: "Unsupported",
			[PR.Disabled]: "Disabled",
			[PR.NotNeeded]: "NotNeeded",
			[PR.Optional]: "Optional",
			[PR.Mandatory]: "Mandatory",
		};
		return (
			`Protocol: ${convert.protocolStr(this.protocol)}, ` +
			`Port: ${this.port}, ` +
			`Credentials: ${this.credentials}, ` +
			`Requires Password: ${this.requiresPassword}, ` +
			`Password: ${this.password}, ` +
			`Pairing: ${pairingName[this.pairing]}` +
			(!this.enabled ? " (Disabled)" : "")
		);
	}

	abstract deepCopy(): BaseService;
}

// Register all RemoteControl features
registerFeature(0, "Up", "Up button on remote.");
registerFeature(1, "Down", "Down button on remote.");
registerFeature(2, "Left", "Left button on remote.");
registerFeature(3, "Right", "Right button on remote.");
registerFeature(4, "Play", "Start playing media.");
registerFeature(5, "PlayPause", "Toggle between play/pause.");
registerFeature(6, "Pause", "Pause playing media.");
registerFeature(7, "Stop", "Stop playing media.");
registerFeature(8, "Next", "Change to next item.");
registerFeature(9, "Previous", "Change to previous item.");
registerFeature(10, "Select", "Select current option.");
registerFeature(11, "Menu", "Go back to previous menu.");
registerFeature(12, "VolumeUp", "Increase volume.");
registerFeature(13, "VolumeDown", "Decrease volume.");
registerFeature(14, "Home", "Home/TV button.");
registerFeature(
	15,
	"HomeHold",
	"Long-press home button (deprecated: use RemoteControl.home).",
);
registerFeature(16, "TopMenu", "Go to main menu.");
registerFeature(
	17,
	"Suspend",
	"Suspend device (deprecated; use Power.turnOff).",
);
registerFeature(18, "WakeUp", "Wake up device (deprecated; use Power.turnOn).");
registerFeature(19, "SetPosition", "Seek to position.");
registerFeature(20, "SetShuffle", "Change shuffle state.");
registerFeature(21, "SetRepeat", "Change repeat state.");
registerFeature(22, "Title", "Title of playing media.");
registerFeature(23, "Artist", "Artist of playing song.");
registerFeature(24, "Album", "Album from playing artist.");
registerFeature(25, "Genre", "Genre of playing song.");
registerFeature(26, "TotalTime", "Total length of playing media (seconds).");
registerFeature(27, "Position", "Current play time position.");
registerFeature(28, "Shuffle", "Shuffle state.");
registerFeature(29, "Repeat", "Repeat state.");
registerFeature(30, "Artwork", "Playing media artwork.");
registerFeature(31, "PlayUrl", "Stream a URL on device.");
registerFeature(32, "PowerState", "Current device power state.");
registerFeature(33, "TurnOn", "Turn device on.");
registerFeature(34, "TurnOff", "Turn off device.");
registerFeature(35, "App", "App playing media.");
registerFeature(36, "SkipForward", "Skip forward a time interval.");
registerFeature(37, "SkipBackward", "Skip backwards a time interval.");
registerFeature(38, "AppList", "List of launchable apps.");
registerFeature(39, "LaunchApp", "Launch an app.");
registerFeature(40, "SeriesName", "Title of TV series.");
registerFeature(41, "SeasonNumber", "Season number of TV series.");
registerFeature(42, "EpisodeNumber", "Episode number of TV series.");
registerFeature(43, "PushUpdates", "Push updates are supported.");
registerFeature(44, "StreamFile", "Stream local file to device.");
registerFeature(45, "Volume", "Current volume level.");
registerFeature(46, "SetVolume", "Set volume level.");
registerFeature(47, "ContentIdentifier", "Identifier for Content");
registerFeature(48, "ChannelUp", "Select next channel.");
registerFeature(49, "ChannelDown", "Select previous channel.");
registerFeature(
	50,
	"iTunesStoreIdentifier",
	"iTunes Store identifier for Content",
);
registerFeature(51, "TextGet", "Get current virtual keyboard text.");
registerFeature(52, "TextClear", "Clear virtual keyboard text.");
registerFeature(53, "TextAppend", "Input text into virtual keyboard.");
registerFeature(54, "TextSet", "Replace text in virtual keyboard.");
registerFeature(55, "AccountList", "List of user accounts.");
registerFeature(56, "SwitchAccount", "Switch user account.");
registerFeature(57, "TextFocusState", "Current virtual keyboard focus state.");
registerFeature(58, "Screensaver", "Activate screen saver.");
registerFeature(59, "OutputDevices", "Current output devices.");
registerFeature(60, "AddOutputDevices", "Add output devices.");
registerFeature(61, "RemoveOutputDevices", "Remove output devices.");
registerFeature(62, "SetOutputDevices", "Set output devices.");
registerFeature(
	63,
	"Swipe",
	"Swipe gesture from given coordinates and duration.",
);
registerFeature(64, "TouchAction", "Touch event to given coordinates.");
registerFeature(65, "TouchClick", "Touch click command.");
registerFeature(66, "Guide", "Show EPG.");
registerFeature(68, "ControlCenter", "Control Center.");

export class RemoteControl {
	async up(_action: InputAction = InputAction.SingleTap): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async down(_action: InputAction = InputAction.SingleTap): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async left(_action: InputAction = InputAction.SingleTap): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async right(_action: InputAction = InputAction.SingleTap): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async play(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async playPause(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async pause(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async stop(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async next(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async previous(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async select(_action: InputAction = InputAction.SingleTap): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async menu(_action: InputAction = InputAction.SingleTap): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async volumeUp(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async volumeDown(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async home(_action: InputAction = InputAction.SingleTap): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async homeHold(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async topMenu(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async suspend(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async wakeup(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async skipForward(_timeInterval = 0.0): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async skipBackward(_timeInterval = 0.0): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async setPosition(_pos: number): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async setShuffle(_shuffleState: ShuffleState): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async setRepeat(_repeatState: RepeatState): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async channelUp(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async channelDown(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async screensaver(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async guide(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async controlCenter(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}
}

export interface PlayingInit {
	mediaType?: MediaType;
	deviceState?: DeviceState;
	title?: string | null;
	artist?: string | null;
	album?: string | null;
	genre?: string | null;
	totalTime?: number | null;
	position?: number | null;
	shuffle?: ShuffleState | null;
	repeat?: RepeatState | null;
	hash?: string | null;
	seriesName?: string | null;
	seasonNumber?: number | null;
	episodeNumber?: number | null;
	contentIdentifier?: string | null;
	itunesStoreIdentifier?: number | null;
}

const PLAYING_PROPERTIES = [
	"mediaType",
	"deviceState",
	"title",
	"artist",
	"album",
	"genre",
	"totalTime",
	"position",
	"shuffle",
	"repeat",
	"hash",
	"seriesName",
	"seasonNumber",
	"episodeNumber",
	"contentIdentifier",
	"itunesStoreIdentifier",
] as const;

export class Playing {
	private _mediaType: MediaType;
	private _deviceState: DeviceState;
	private _title: string | null;
	private _artist: string | null;
	private _album: string | null;
	private _genre: string | null;
	private _totalTime: number | null;
	private _position: number | null;
	private _shuffle: ShuffleState | null;
	private _repeat: RepeatState | null;
	private _hash: string | null;
	private _seriesName: string | null;
	private _seasonNumber: number | null;
	private _episodeNumber: number | null;
	private _contentIdentifier: string | null;
	private _itunesStoreIdentifier: number | null;

	constructor(init: PlayingInit = {}) {
		this._mediaType = init.mediaType ?? MediaType.Unknown;
		this._deviceState = init.deviceState ?? DeviceState.Idle;
		this._title = init.title ?? null;
		this._artist = init.artist ?? null;
		this._album = init.album ?? null;
		this._genre = init.genre ?? null;
		this._totalTime = init.totalTime ?? null;
		this._position = init.position ?? null;
		this._shuffle = init.shuffle ?? null;
		this._repeat = init.repeat ?? null;
		this._hash = init.hash ?? null;
		this._seriesName = init.seriesName ?? null;
		this._seasonNumber = init.seasonNumber ?? null;
		this._episodeNumber = init.episodeNumber ?? null;
		this._contentIdentifier = init.contentIdentifier ?? null;
		this._itunesStoreIdentifier = init.itunesStoreIdentifier ?? null;
		this._postProcess();
	}

	private _postProcess(): void {
		if (this._position) {
			this._position = Math.max(this._position, 0);
			if (this._totalTime) {
				this._position = Math.min(this._position, this._totalTime);
			}
		}
	}

	get hash(): string {
		if (this._hash) return this._hash;
		const base = `${this._title}${this._artist}${this._album}${this._totalTime}`;
		return createHash("sha256").update(base, "utf-8").digest("hex");
	}

	get mediaType(): MediaType {
		return this._mediaType;
	}
	get deviceState(): DeviceState {
		return this._deviceState;
	}
	get title(): string | null {
		return this._title;
	}
	get artist(): string | null {
		return this._artist;
	}
	get album(): string | null {
		return this._album;
	}
	get genre(): string | null {
		return this._genre;
	}
	get totalTime(): number | null {
		return this._totalTime;
	}
	get position(): number | null {
		return this._position;
	}
	get shuffle(): ShuffleState | null {
		return this._shuffle;
	}
	get repeat(): RepeatState | null {
		return this._repeat;
	}
	get seriesName(): string | null {
		return this._seriesName;
	}
	get seasonNumber(): number | null {
		return this._seasonNumber;
	}
	get episodeNumber(): number | null {
		return this._episodeNumber;
	}
	get contentIdentifier(): string | null {
		return this._contentIdentifier;
	}
	get itunesStoreIdentifier(): number | null {
		return this._itunesStoreIdentifier;
	}

	equals(other: Playing): boolean {
		for (const prop of PLAYING_PROPERTIES) {
			if (
				(this as unknown as Record<string, unknown>)[prop] !==
				(other as unknown as Record<string, unknown>)[prop]
			)
				return false;
		}
		return true;
	}

	toString(): string {
		const output: string[] = [];
		output.push(`  Media type: ${convert.mediaTypeStr(this.mediaType)}`);
		output.push(`Device state: ${convert.deviceStateStr(this.deviceState)}`);

		if (this.title !== null) output.push(`       Title: ${this.title}`);
		if (this.artist !== null) output.push(`      Artist: ${this.artist}`);
		if (this.album !== null) output.push(`       Album: ${this.album}`);
		if (this.genre !== null) output.push(`       Genre: ${this.genre}`);
		if (this.seriesName !== null)
			output.push(` Series Name: ${this.seriesName}`);
		if (this.seasonNumber !== null)
			output.push(`      Season: ${this.seasonNumber}`);
		if (this.episodeNumber !== null)
			output.push(`     Episode: ${this.episodeNumber}`);
		if (this.contentIdentifier)
			output.push(`  Identifier: ${this.contentIdentifier}`);

		const position = this.position;
		const totalTime = this.totalTime;
		if (position !== null && totalTime !== null && totalTime !== 0) {
			const pct = ((position / totalTime) * 100).toFixed(1);
			output.push(`    Position: ${position}/${totalTime}s (${pct}%)`);
		} else if (position !== null && position !== 0) {
			output.push(`    Position: ${position}s`);
		} else if (totalTime !== null && position !== 0) {
			output.push(`  Total time: ${totalTime}s`);
		}

		if (this.repeat !== null)
			output.push(`      Repeat: ${convert.repeatStr(this.repeat)}`);
		if (this.shuffle !== null)
			output.push(`     Shuffle: ${convert.shuffleStr(this.shuffle)}`);
		if (this._itunesStoreIdentifier !== null)
			output.push(`iTunes Store Identifier: ${this._itunesStoreIdentifier}`);

		return output.join("\n");
	}
}

export class App {
	private _name: string | null;
	private _identifier: string;

	constructor(name: string | null, identifier: string) {
		this._name = name;
		this._identifier = identifier;
	}

	get name(): string | null {
		return this._name;
	}

	get identifier(): string {
		return this._identifier;
	}

	toString(): string {
		return `App: ${this.name} (${this.identifier})`;
	}

	equals(other: App): boolean {
		return this.name === other.name && this.identifier === other.identifier;
	}
}

export class UserAccount {
	private _name: string;
	private _identifier: string;

	constructor(name: string, identifier: string) {
		this._name = name;
		this._identifier = identifier;
	}

	get name(): string {
		return this._name;
	}

	get identifier(): string {
		return this._identifier;
	}

	toString(): string {
		return `Account: ${this.name} (${this.identifier})`;
	}

	equals(other: UserAccount): boolean {
		return this.name === other.name && this.identifier === other.identifier;
	}
}

export interface OutputDevice {
	identifier: string;
	name?: string | null;
	volume?: number;
}

export class DeviceInfo {
	static readonly OPERATING_SYSTEM = "os";
	static readonly VERSION = "version";
	static readonly BUILD_NUMBER = "build_number";
	static readonly MODEL = "model";
	static readonly RAW_MODEL = "raw_model";
	static readonly MAC = "mac";
	static readonly OUTPUT_DEVICE_ID = "airplay_id";

	private _devinfo: Record<string, unknown>;
	private _os: OperatingSystem;
	private _version: string | null;
	private _buildNumber: string | null;
	private _model: DeviceModel;
	private _mac: string | null;
	private _outputDeviceId: string | null;

	constructor(deviceInfo: Record<string, unknown>) {
		this._devinfo = { ...deviceInfo };
		this._os = this._popWithType(
			DeviceInfo.OPERATING_SYSTEM,
			OperatingSystem.Unknown,
		) as OperatingSystem;
		this._version = this._popWithType(DeviceInfo.VERSION, null) as
			| string
			| null;
		this._buildNumber = this._popWithType(DeviceInfo.BUILD_NUMBER, null) as
			| string
			| null;
		this._model = this._popWithType(
			DeviceInfo.MODEL,
			DeviceModel.Unknown,
		) as DeviceModel;
		this._mac = this._popWithType(DeviceInfo.MAC, null) as string | null;
		this._outputDeviceId = this._popWithType(
			DeviceInfo.OUTPUT_DEVICE_ID,
			null,
		) as string | null;
	}

	private _popWithType(field: string, defaultValue: unknown): unknown {
		const value = this._devinfo[field] ?? defaultValue;
		delete this._devinfo[field];
		return value;
	}

	get operatingSystem(): OperatingSystem {
		if (this._os !== OperatingSystem.Unknown) return this._os;

		if (
			this.model === DeviceModel.AirPortExpress ||
			this.model === DeviceModel.AirPortExpressGen2
		) {
			return OperatingSystem.AirPortOS;
		}
		if (
			this.model === DeviceModel.HomePod ||
			this.model === DeviceModel.HomePodMini
		) {
			return OperatingSystem.TvOS;
		}
		if (
			[
				DeviceModel.Gen2,
				DeviceModel.Gen3,
				DeviceModel.Gen4,
				DeviceModel.Gen4K,
				DeviceModel.AppleTV4KGen2,
				DeviceModel.AppleTV4KGen3,
			].includes(this.model)
		) {
			return OperatingSystem.TvOS;
		}

		return OperatingSystem.Unknown;
	}

	get version(): string | null {
		if (this._version) return this._version;
		return this._version;
	}

	get buildNumber(): string | null {
		return this._buildNumber;
	}

	get model(): DeviceModel {
		return this._model;
	}

	get rawModel(): string | null {
		return (this._devinfo[DeviceInfo.RAW_MODEL] as string) ?? null;
	}

	get modelStr(): string {
		if (this.model === DeviceModel.Unknown && this.rawModel) {
			return this.rawModel;
		}
		return convert.modelStr(this.model);
	}

	get mac(): string | null {
		return this._mac;
	}

	get outputDeviceId(): string | null {
		return this._outputDeviceId;
	}

	toString(): string {
		const osMap: Record<number, string> = {
			[OperatingSystem.Legacy]: "ATV SW",
			[OperatingSystem.TvOS]: "tvOS",
			[OperatingSystem.AirPortOS]: "AirPortOS",
			[OperatingSystem.MacOS]: "MacOS",
		};
		let output = `${this.modelStr}, ${osMap[this.operatingSystem] ?? "Unknown OS"}`;
		if (this.version) output += ` ${this.version}`;
		if (this.buildNumber) output += ` build ${this.buildNumber}`;
		return output;
	}
}

export class Features {
	getFeature(_featureName: FeatureName): FeatureInfo {
		throw new Error("Not implemented");
	}

	allFeatures(includeUnsupported = false): Map<FeatureName, FeatureInfo> {
		const features = new Map<FeatureName, FeatureInfo>();
		for (const name of Object.values(FeatureName)) {
			if (typeof name !== "number") continue;
			const info = this.getFeature(name as FeatureName);
			if (info.state !== FeatureState.Unsupported || includeUnsupported) {
				features.set(name as FeatureName, info);
			}
		}
		return features;
	}

	inState(
		states: FeatureState | FeatureState[],
		...featureNames: FeatureName[]
	): boolean {
		for (const name of featureNames) {
			const info = this.getFeature(name);
			const expectedStates = Array.isArray(states) ? states : [states];
			if (!expectedStates.includes(info.state)) return false;
		}
		return true;
	}
}

export abstract class BaseConfig {
	protected _properties: Record<string, Record<string, string>>;

	constructor(properties: Record<string, Record<string, string>>) {
		this._properties = properties;
	}

	abstract get address(): string;
	abstract get name(): string;
	abstract get deepSleep(): boolean;
	abstract get services(): BaseService[];
	abstract get deviceInfo(): DeviceInfo;
	abstract addService(service: BaseService): void;
	abstract getService(protocol: Protocol): BaseService | null;

	get properties(): Record<string, Record<string, string>> {
		return this._properties;
	}

	get ready(): boolean {
		for (const service of this.services) {
			if (service.identifier) return true;
		}
		return false;
	}

	get identifier(): string | null {
		for (const prot of [
			Protocol.MRP,
			Protocol.DMAP,
			Protocol.AirPlay,
			Protocol.RAOP,
			Protocol.Companion,
		]) {
			const service = this.getService(prot);
			if (service?.identifier !== null && service?.identifier !== undefined) {
				return service.identifier;
			}
		}
		return null;
	}

	get allIdentifiers(): string[] {
		return this.services
			.filter((s) => s.identifier !== null)
			.map((s) => s.identifier as string);
	}

	mainService(protocol?: Protocol): BaseService {
		const protocols = protocol
			? [protocol]
			: [Protocol.MRP, Protocol.DMAP, Protocol.AirPlay, Protocol.RAOP];

		for (const prot of protocols) {
			const service = this.getService(prot);
			if (service !== null) return service;
		}

		throw new exceptions.NoServiceError("no service to connect to");
	}

	setCredentials(protocol: Protocol, credentials: string): boolean {
		const service = this.getService(protocol);
		if (service) {
			service.credentials = credentials;
			return true;
		}
		return false;
	}

	apply(settings: Settings): void {
		for (const service of this.services) {
			if (service.protocol === Protocol.AirPlay) {
				service.apply(
					settings.protocols.airplay as unknown as Record<string, unknown>,
				);
			} else if (service.protocol === Protocol.Companion) {
				service.apply(
					settings.protocols.companion as unknown as Record<string, unknown>,
				);
			} else if (service.protocol === Protocol.DMAP) {
				service.apply(
					settings.protocols.dmap as unknown as Record<string, unknown>,
				);
			} else if (service.protocol === Protocol.MRP) {
				service.apply(
					settings.protocols.mrp as unknown as Record<string, unknown>,
				);
			} else if (service.protocol === Protocol.RAOP) {
				service.apply(
					settings.protocols.raop as unknown as Record<string, unknown>,
				);
			}
		}
	}

	equals(other: BaseConfig): boolean {
		return this.identifier === other.identifier;
	}

	toString(): string {
		const deviceInfo = this.deviceInfo;
		const services = this.services.map((s) => ` - ${s}`).join("\n");
		const identifiers = this.allIdentifiers.map((x) => ` - ${x}`).join("\n");
		return (
			`       Name: ${this.name}\n` +
			`   Model/SW: ${deviceInfo}\n` +
			`    Address: ${this.address}\n` +
			`        MAC: ${this.deviceInfo.mac}\n` +
			` Deep Sleep: ${this.deepSleep}\n` +
			`Identifiers:\n` +
			`${identifiers}\n` +
			`Services:\n` +
			`${services}`
		);
	}

	abstract deepCopy(): BaseConfig;
}

// Listener interfaces
export interface PushListener {
	playstatusUpdate(updater: unknown, playstatus: Playing): void;
	playstatusError(updater: unknown, exception: Error): void;
}

export interface DeviceListener {
	connectionLost(exception: Error): void;
	connectionClosed(): void;
}

export interface PowerListener {
	powerstateUpdate(oldState: PowerState, newState: PowerState): void;
}

export interface AudioListener {
	volumeUpdate(oldLevel: number, newLevel: number): void;
	volumeDeviceUpdate(
		outputDevice: OutputDevice,
		oldLevel: number,
		newLevel: number,
	): void;
	outputdevicesUpdate(
		oldDevices: OutputDevice[],
		newDevices: OutputDevice[],
	): void;
}

export interface KeyboardListener {
	focusstateUpdate(
		oldState: KeyboardFocusState,
		newState: KeyboardFocusState,
	): void;
}

export abstract class PushUpdater extends StateProducer<PushListener> {
	abstract get active(): boolean;
	abstract start(initialDelay?: number): void;
	abstract stop(): void;
}

// --- Base classes for Facade relaying ---

export class Metadata {
	get deviceId(): string | null {
		throw new exceptions.NotSupportedError();
	}

	async playing(): Promise<Playing> {
		throw new exceptions.NotSupportedError();
	}

	async artwork(
		_width?: number | null,
		_height?: number | null,
	): Promise<ArtworkInfo | null> {
		throw new exceptions.NotSupportedError();
	}

	get artworkId(): string | null {
		throw new exceptions.NotSupportedError();
	}
}

export class Power {
	async turnOn(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async turnOff(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	get powerState(): PowerState {
		throw new exceptions.NotSupportedError();
	}
}

export class Audio {
	get volume(): number {
		throw new exceptions.NotSupportedError();
	}

	async setVolume(_level: number): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async volumeUp(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async volumeDown(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async addOutputDevices(..._devices: string[]): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async removeOutputDevices(..._devices: string[]): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async setOutputDevices(..._devices: string[]): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	get outputDevices(): OutputDevice[] {
		throw new exceptions.NotSupportedError();
	}
}

export class Apps {
	async appList(): Promise<App[]> {
		throw new exceptions.NotSupportedError();
	}

	async launchApp(_bundleIdOrUrl: string): Promise<void> {
		throw new exceptions.NotSupportedError();
	}
}

export class UserAccounts {
	async accountList(): Promise<UserAccount[]> {
		throw new exceptions.NotSupportedError();
	}

	async switchAccount(_accountId: string): Promise<void> {
		throw new exceptions.NotSupportedError();
	}
}

export class Keyboard {
	get textFocusState(): KeyboardFocusState {
		throw new exceptions.NotSupportedError();
	}

	async textGet(): Promise<string | null> {
		throw new exceptions.NotSupportedError();
	}

	async textClear(): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async textAppend(_text: string): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async textSet(_text: string): Promise<void> {
		throw new exceptions.NotSupportedError();
	}
}

export class TouchGestures {
	async swipe(
		_startX: number,
		_startY: number,
		_endX: number,
		_endY: number,
		_durationMs: number,
	): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async action(_x: number, _y: number, _mode: number): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	async click(_clickAction: InputAction): Promise<void> {
		throw new exceptions.NotSupportedError();
	}
}

export class Stream {
	async playUrl(
		_url: string,
		_options?: Record<string, unknown>,
	): Promise<void> {
		throw new exceptions.NotSupportedError();
	}

	stop(): void {
		throw new exceptions.NotSupportedError();
	}

	close(): void {
		throw new exceptions.NotSupportedError();
	}
}

export { StateProducer };
