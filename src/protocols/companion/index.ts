/**
 * Implementation of the Companion protocol used by Apple TV 4K and later.
 */

import {
	DeviceModel,
	FeatureName,
	FeatureState,
	InputAction,
	KeyboardFocusState,
	PairingRequirement,
	PowerState,
	Protocol,
	type TouchAction,
} from "../../const.js";
import {
	type Core,
	MutableService,
	type SetupData,
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
import type { BaseService } from "../../interface.js";
import {
	App,
	DeviceInfo,
	type FeatureInfo,
	Features,
	RemoteControl,
	UserAccount,
} from "../../interface.js";
import { lookupModel } from "../../support/deviceInfo.js";
import {
	CompanionAPI,
	HidCommand,
	MediaControlCommand,
	SystemStatus,
} from "./api.js";
import { CompanionPairingHandler } from "./pairing.js";

// rpfl bitmask constants
const PAIRING_DISABLED_MASK = 0x04;
const PAIRING_WITH_PIN_SUPPORTED_MASK = 0x4000;

const _DEFAULT_SKIP_TIME = 10;

// --- MediaControlFlags ---

enum MediaControlFlags {
	NoControls = 0x0000,
	Play = 0x0001,
	Pause = 0x0002,
	NextTrack = 0x0004,
	PreviousTrack = 0x0008,
	FastForward = 0x0010,
	Rewind = 0x0020,
	Volume = 0x0100,
	SkipForward = 0x0200,
	SkipBackward = 0x0400,
}

const MEDIA_CONTROL_MAP: Record<number, number> = {
	[FeatureName.Play]: MediaControlFlags.Play,
	[FeatureName.Pause]: MediaControlFlags.Pause,
	[FeatureName.Next]: MediaControlFlags.NextTrack,
	[FeatureName.Previous]: MediaControlFlags.PreviousTrack,
	[FeatureName.Volume]: MediaControlFlags.Volume,
	[FeatureName.SetVolume]: MediaControlFlags.Volume,
	[FeatureName.SkipForward]: MediaControlFlags.SkipForward,
	[FeatureName.SkipBackward]: MediaControlFlags.SkipBackward,
};

const SUPPORTED_FEATURES = new Set<FeatureName>([
	// App interface
	FeatureName.AppList,
	FeatureName.LaunchApp,
	// User account interface
	FeatureName.AccountList,
	FeatureName.SwitchAccount,
	// Power interface
	FeatureName.PowerState,
	FeatureName.TurnOn,
	FeatureName.TurnOff,
	// Remote control (navigation, i.e. HID)
	FeatureName.Up,
	FeatureName.Down,
	FeatureName.Left,
	FeatureName.Right,
	FeatureName.Select,
	FeatureName.Menu,
	FeatureName.Home,
	FeatureName.VolumeUp,
	FeatureName.VolumeDown,
	FeatureName.PlayPause,
	FeatureName.ChannelUp,
	FeatureName.ChannelDown,
	FeatureName.Screensaver,
	FeatureName.Guide,
	FeatureName.ControlCenter,
	// Keyboard interface
	FeatureName.TextFocusState,
	FeatureName.TextGet,
	FeatureName.TextClear,
	FeatureName.TextAppend,
	FeatureName.TextSet,
	FeatureName.Swipe,
	FeatureName.Action,
	FeatureName.Click,
	// Media control features
	FeatureName.Play,
	FeatureName.Pause,
	FeatureName.Next,
	FeatureName.Previous,
	FeatureName.Volume,
	FeatureName.SetVolume,
	FeatureName.SkipForward,
	FeatureName.SkipBackward,
]);

// --- CompanionApps ---

export class CompanionApps {
	private api: CompanionAPI;

	constructor(api: CompanionAPI) {
		this.api = api;
	}

	async appList(): Promise<App[]> {
		const appListResp = await this.api.appList();
		const content = appListResp._c as Record<string, string> | undefined;
		if (!content) {
			throw new exceptions.ProtocolError("missing content in response");
		}

		return Object.entries(content).map(
			([bundleId, name]) => new App(name, bundleId),
		);
	}

	async launchApp(bundleIdOrUrl: string): Promise<void> {
		await this.api.launchApp(bundleIdOrUrl);
	}
}

// --- CompanionUserAccounts ---

export class CompanionUserAccounts {
	private api: CompanionAPI;

	constructor(api: CompanionAPI) {
		this.api = api;
	}

	async accountList(): Promise<UserAccount[]> {
		const accountListResp = await this.api.accountList();
		const content = accountListResp._c as Record<string, string> | undefined;
		if (!content) {
			throw new exceptions.ProtocolError("missing content in response");
		}

		return Object.entries(content).map(
			([accountId, name]) => new UserAccount(name, accountId),
		);
	}

	async switchAccount(accountId: string): Promise<void> {
		await this.api.switchAccount(accountId);
	}
}

// --- CompanionPower ---

export class CompanionPower {
	private api: CompanionAPI;
	private _powerState: PowerState = PowerState.Unknown;

	constructor(api: CompanionAPI) {
		this.api = api;
	}

	get supportsPowerUpdates(): boolean {
		return this._powerState !== PowerState.Unknown;
	}

	async initialize(): Promise<void> {
		try {
			const systemStatus = await this.api.fetchAttentionState();
			this._powerState = CompanionPower._systemStatusToPowerState(systemStatus);

			this.api.listenTo("SystemStatus", (data: Record<string, unknown>) =>
				this._handleSystemStatusUpdate(data),
			);
			await this.api.subscribeEvent("SystemStatus");

			this.api.listenTo("TVSystemStatus", (data: Record<string, unknown>) =>
				this._handleSystemStatusUpdate(data),
			);
			await this.api.subscribeEvent("TVSystemStatus");
		} catch {
			// Could not fetch SystemStatus, power_state will not work
		}
	}

	get powerState(): PowerState {
		return this._powerState;
	}

	private async _handleSystemStatusUpdate(
		data: Record<string, unknown>,
	): Promise<void> {
		try {
			this._powerState = CompanionPower._systemStatusToPowerState(
				Number(data.state) as SystemStatus,
			);
		} catch {
			// Invalid SystemStatus
		}
	}

	private static _systemStatusToPowerState(
		systemStatus: SystemStatus,
	): PowerState {
		if (systemStatus === SystemStatus.Asleep) return PowerState.Off;
		if (
			systemStatus === SystemStatus.Screensaver ||
			systemStatus === SystemStatus.Awake ||
			systemStatus === SystemStatus.Idle
		) {
			return PowerState.On;
		}
		return PowerState.Unknown;
	}

	async turnOn(): Promise<void> {
		await this.api.hidCommand(false, HidCommand.Wake);
	}

	async turnOff(): Promise<void> {
		await this.api.hidCommand(false, HidCommand.Sleep);
	}
}

// --- CompanionRemoteControl ---

export class CompanionRemoteControl extends RemoteControl {
	private api: CompanionAPI;

	constructor(api: CompanionAPI) {
		super();
		this.api = api;
	}

	async up(action: InputAction = InputAction.SingleTap): Promise<void> {
		await this._pressButton(HidCommand.Up, action);
	}

	async down(action: InputAction = InputAction.SingleTap): Promise<void> {
		await this._pressButton(HidCommand.Down, action);
	}

	async left(action: InputAction = InputAction.SingleTap): Promise<void> {
		await this._pressButton(HidCommand.Left, action);
	}

	async right(action: InputAction = InputAction.SingleTap): Promise<void> {
		await this._pressButton(HidCommand.Right, action);
	}

	async select(action: InputAction = InputAction.SingleTap): Promise<void> {
		await this._pressButton(HidCommand.Select, action);
	}

	async menu(action: InputAction = InputAction.SingleTap): Promise<void> {
		await this._pressButton(HidCommand.Menu, action);
	}

	async home(action: InputAction = InputAction.SingleTap): Promise<void> {
		await this._pressButton(HidCommand.Home, action);
	}

	async volumeUp(): Promise<void> {
		await this._pressButton(HidCommand.VolumeUp);
	}

	async volumeDown(): Promise<void> {
		await this._pressButton(HidCommand.VolumeDown);
	}

	async playPause(): Promise<void> {
		await this._pressButton(HidCommand.PlayPause);
	}

	async play(): Promise<void> {
		await this.api.mediacontrolCommand(MediaControlCommand.Play);
	}

	async pause(): Promise<void> {
		await this.api.mediacontrolCommand(MediaControlCommand.Pause);
	}

	async next(): Promise<void> {
		await this.api.mediacontrolCommand(MediaControlCommand.NextTrack);
	}

	async previous(): Promise<void> {
		await this.api.mediacontrolCommand(MediaControlCommand.PreviousTrack);
	}

	async skipForward(timeInterval = 0.0): Promise<void> {
		await this.api.mediacontrolCommand(MediaControlCommand.SkipBy, {
			_skpS: timeInterval > 0 ? timeInterval : _DEFAULT_SKIP_TIME,
		});
	}

	async skipBackward(timeInterval = 0.0): Promise<void> {
		await this.api.mediacontrolCommand(MediaControlCommand.SkipBy, {
			_skpS: timeInterval > 0 ? -timeInterval : -_DEFAULT_SKIP_TIME,
		});
	}

	async channelUp(): Promise<void> {
		await this._pressButton(HidCommand.ChannelIncrement);
	}

	async channelDown(): Promise<void> {
		await this._pressButton(HidCommand.ChannelDecrement);
	}

	async screensaver(): Promise<void> {
		await this._pressButton(HidCommand.Screensaver);
	}

	async guide(): Promise<void> {
		await this._pressButton(HidCommand.Guide);
	}

	async controlCenter(): Promise<void> {
		await this._pressButton(HidCommand.PageDown);
	}

	private async _pressButton(
		command: HidCommand,
		action: InputAction = InputAction.SingleTap,
		delay = 1000,
	): Promise<void> {
		if (action === InputAction.SingleTap) {
			await this.api.hidCommand(true, command);
			await this.api.hidCommand(false, command);
		} else if (action === InputAction.Hold) {
			await this.api.hidCommand(true, command);
			await new Promise<void>((resolve) => setTimeout(resolve, delay));
			await this.api.hidCommand(false, command);
		} else if (action === InputAction.DoubleTap) {
			await this.api.hidCommand(true, command);
			await this.api.hidCommand(false, command);
			await this.api.hidCommand(true, command);
			await this.api.hidCommand(false, command);
		} else {
			throw new exceptions.NotSupportedError(
				`unsupported input action: ${action}`,
			);
		}
	}
}

// --- CompanionAudio ---

export class CompanionAudio {
	private api: CompanionAPI;
	private core: Core;
	private _volume = 0.0;

	constructor(api: CompanionAPI, core: Core) {
		this.api = api;
		this.core = core;
		this.api.listenTo("_iMC", (data: Record<string, unknown>) =>
			this._handleControlFlagUpdate(data),
		);
	}

	private async _handleControlFlagUpdate(
		data: Record<string, unknown>,
	): Promise<void> {
		if ((data._mcF as number) & MediaControlFlags.Volume) {
			const resp = await this.api.mediacontrolCommand(
				MediaControlCommand.GetVolume,
			);
			const content = resp._c as Record<string, unknown>;
			this._volume = (content._vol as number) * 100.0;
		} else {
			this._volume = 0.0;
		}

		this.core.stateDispatcher.dispatch(UpdatedState.Volume, this.volume);
	}

	get volume(): number {
		return this._volume;
	}

	async setVolume(level: number): Promise<void> {
		await this.api.mediacontrolCommand(MediaControlCommand.SetVolume, {
			_vol: level / 100.0,
		});
	}

	async volumeUp(): Promise<void> {
		await this.api.hidCommand(true, HidCommand.VolumeUp);
		await this.api.hidCommand(false, HidCommand.VolumeUp);
	}

	async volumeDown(): Promise<void> {
		await this.api.hidCommand(true, HidCommand.VolumeDown);
		await this.api.hidCommand(false, HidCommand.VolumeDown);
	}
}

// --- CompanionKeyboard ---

export class CompanionKeyboard {
	private api: CompanionAPI;
	private core: Core;
	private _focusState: KeyboardFocusState = KeyboardFocusState.Unknown;

	constructor(api: CompanionAPI, core: Core) {
		this.api = api;
		this.core = core;
		this.api.listenTo("_tiStarted", (data: Record<string, unknown>) =>
			this._handleTextInput(data),
		);
		this.api.listenTo("_tiStopped", (data: Record<string, unknown>) =>
			this._handleTextInput(data),
		);
		this.api.listenTo("_tiStart", (data: Record<string, unknown>) =>
			this._handleTextInput(data),
		);
	}

	private async _handleTextInput(data: Record<string, unknown>): Promise<void> {
		const state =
			"_tiD" in data
				? KeyboardFocusState.Focused
				: KeyboardFocusState.Unfocused;
		this._focusState = state;
		this.core.stateDispatcher.dispatch(UpdatedState.KeyboardFocus, state);
	}

	get textFocusState(): KeyboardFocusState {
		return this._focusState;
	}

	async textGet(): Promise<string | null> {
		return this.api.textInputCommand("", false);
	}

	async textClear(): Promise<void> {
		await this.api.textInputCommand("", true);
	}

	async textAppend(text: string): Promise<void> {
		await this.api.textInputCommand(text, false);
	}

	async textSet(text: string): Promise<void> {
		await this.api.textInputCommand(text, true);
	}
}

// --- CompanionTouchGestures ---

export class CompanionTouchGestures {
	private api: CompanionAPI;

	constructor(api: CompanionAPI) {
		this.api = api;
	}

	async swipe(
		startX: number,
		startY: number,
		endX: number,
		endY: number,
		durationMs: number,
	): Promise<void> {
		await this.api.swipe(startX, startY, endX, endY, durationMs);
	}

	async action(x: number, y: number, mode: TouchAction): Promise<void> {
		await this.api.action(x, y, mode);
	}

	async click(clickAction: InputAction): Promise<void> {
		await this.api.click(clickAction);
	}
}

// --- CompanionFeatures ---

export class CompanionFeatures extends Features {
	private _controlFlags: number = MediaControlFlags.NoControls;
	private _power: CompanionPower;

	constructor(api: CompanionAPI, power: CompanionPower) {
		super();
		api.listenTo("_iMC", (data: Record<string, unknown>) =>
			this._handleControlFlagUpdate(data),
		);
		this._power = power;
	}

	private async _handleControlFlagUpdate(
		data: Record<string, unknown>,
	): Promise<void> {
		this._controlFlags = data._mcF as number;
	}

	getFeature(featureName: FeatureName): FeatureInfo {
		if (featureName in MEDIA_CONTROL_MAP) {
			const isAvailable = MEDIA_CONTROL_MAP[featureName] & this._controlFlags;
			return {
				state: isAvailable ? FeatureState.Available : FeatureState.Unavailable,
			};
		}

		if (featureName === FeatureName.PowerState) {
			return {
				state: this._power.supportsPowerUpdates
					? FeatureState.Available
					: FeatureState.Unsupported,
			};
		}

		if (SUPPORTED_FEATURES.has(featureName)) {
			return { state: FeatureState.Available };
		}

		return { state: FeatureState.Unavailable };
	}
}

// --- Scan Handlers ---

export function companionServiceHandler(
	mdnsService: mdnsTypes.Service,
	_response: mdnsTypes.Response,
): ScanHandlerReturn | null {
	const service = new MutableService(
		getUniqueId(mdnsService.type, mdnsService.name, mdnsService.properties),
		Protocol.Companion,
		mdnsService.port,
		mdnsService.properties,
	);
	return [mdnsService.name, service];
}

export function scan(): Record<string, ScanHandlerDeviceInfoName> {
	return {
		"_companion-link._tcp.local": [
			companionServiceHandler,
			deviceInfoNameFromUniqueShortName,
		],
	};
}

export function deviceInfo(
	_serviceType: string,
	properties: Record<string, unknown>,
): Record<string, unknown> {
	const devinfo: Record<string, unknown> = {};
	if ("rpmd" in properties) {
		const rawModel = properties.rpmd as string;
		const model = lookupModel(rawModel);
		devinfo[DeviceInfo.RAW_MODEL] = rawModel;
		if (model !== DeviceModel.Unknown) {
			devinfo[DeviceInfo.MODEL] = model;
		}
	}
	return devinfo;
}

export async function serviceInfo(
	service: MutableService,
	_devinfo: DeviceInfo,
	_services: Map<Protocol, BaseService>,
): Promise<void> {
	const flags = Number.parseInt(
		(service.properties.rpfl as string) ?? "0x0",
		16,
	);
	if (flags & PAIRING_DISABLED_MASK) {
		service.pairing = PairingRequirement.Disabled;
	} else if (flags & PAIRING_WITH_PIN_SUPPORTED_MASK) {
		service.pairing = PairingRequirement.Mandatory;
	} else {
		service.pairing = PairingRequirement.Unsupported;
	}
}

export function* setup(core: Core): Generator<SetupData> {
	// Companion doesn't work without credentials, so don't setup if none exist
	if (!core.service.credentials) {
		return;
	}

	const api = new CompanionAPI(core);
	const power = new CompanionPower(api);

	const interfaces = new Map<unknown, unknown>();
	interfaces.set("Apps", new CompanionApps(api));
	interfaces.set("UserAccounts", new CompanionUserAccounts(api));
	interfaces.set(Features, new CompanionFeatures(api, power));
	interfaces.set("Power", power);
	interfaces.set(RemoteControl, new CompanionRemoteControl(api));
	interfaces.set("Audio", new CompanionAudio(api, core));
	interfaces.set("Keyboard", new CompanionKeyboard(api, core));
	interfaces.set("TouchGestures", new CompanionTouchGestures(api));

	const connect = async (): Promise<boolean> => {
		await api.connect();
		await power.initialize();
		return true;
	};

	const close = (): Set<Promise<void>> => {
		return new Set([api.disconnect()]);
	};

	const getDeviceInfo = (): Record<string, unknown> => {
		return deviceInfo(Object.keys(scan())[0], core.service.properties);
	};

	yield {
		protocol: Protocol.Companion,
		connect,
		close,
		deviceInfo: getDeviceInfo,
		interfaces,
		features: SUPPORTED_FEATURES,
	};
}

export function pair(
	core: Core,
	options?: Record<string, unknown>,
): CompanionPairingHandler {
	return new CompanionPairingHandler(core, options);
}
