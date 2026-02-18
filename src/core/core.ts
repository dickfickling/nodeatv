/**
 * Core module - state dispatching, mutable services, and core infrastructure.
 */

import type { FeatureName, PairingRequirement, Protocol } from "../const.js";
import { PairingRequirement as PR } from "../const.js";
import {
	type BaseConfig,
	BaseService,
	type Playing,
	PushUpdater,
	StateProducer,
} from "../interface.js";
import type { Settings } from "../settings.js";
import { type ClientSessionManager, createSession } from "../support/http.js";
import { MessageDispatcher } from "./protocol.js";

// --- TakeoverMethod ---

export type TakeoverMethod = (...args: unknown[]) => () => void;

// --- UpdatedState ---

export enum UpdatedState {
	Playing = 1,
	Volume = 2,
	KeyboardFocus = 3,
	OutputDevices = 4,
	OutputDeviceVolume = 5,
}

// --- StateMessage ---

export interface StateMessage {
	protocol: Protocol;
	state: UpdatedState;
	value: unknown;
}

export function stateMessageToString(msg: StateMessage): string {
	const protocolName =
		typeof msg.protocol === "number" ? String(msg.protocol) : msg.protocol;
	const stateName = UpdatedState[msg.state] ?? String(msg.state);
	return `[${protocolName}.${stateName} -> ${msg.value}]`;
}

// --- CoreStateDispatcher ---

export type CoreStateDispatcher = MessageDispatcher<UpdatedState, StateMessage>;

// --- ProtocolStateDispatcher ---

export class ProtocolStateDispatcher {
	private _protocol: Protocol;
	private _coreDispatcher: CoreStateDispatcher;

	constructor(protocol: Protocol, coreDispatcher: CoreStateDispatcher) {
		this._protocol = protocol;
		this._coreDispatcher = coreDispatcher;
	}

	createCopy(protocol: Protocol): ProtocolStateDispatcher {
		return new ProtocolStateDispatcher(protocol, this._coreDispatcher);
	}

	listenTo(
		state: UpdatedState,
		func:
			| ((message: StateMessage) => void)
			| ((message: StateMessage) => Promise<void>),
		messageFilter: (message: StateMessage) => boolean = () => true,
	): void {
		this._coreDispatcher.listenTo(state, func, messageFilter);
	}

	dispatch(state: UpdatedState, value: unknown): Promise<void>[] {
		return this._coreDispatcher.dispatch(state, {
			protocol: this._protocol,
			state,
			value,
		});
	}
}

// --- MutableService ---

export class MutableService extends BaseService {
	private _requiresPassword = false;
	private _pairingRequirement: PairingRequirement = PR.Unsupported;

	constructor(
		identifier: string | null,
		protocol: Protocol,
		port: number,
		properties?: Record<string, string> | null,
		credentials?: string | null,
		password?: string | null,
		enabled = true,
	) {
		super(
			identifier,
			protocol,
			port,
			properties,
			credentials,
			password,
			enabled,
		);
	}

	get requiresPassword(): boolean {
		return this._requiresPassword;
	}

	set requiresPassword(value: boolean) {
		this._requiresPassword = value;
	}

	get pairing(): PairingRequirement {
		return this._pairingRequirement;
	}

	set pairing(value: PairingRequirement) {
		this._pairingRequirement = value;
	}

	deepCopy(): MutableService {
		const copy = new MutableService(
			this.identifier,
			this.protocol,
			this.port,
			{ ...this.properties },
			this.credentials,
			this.password,
			this.enabled,
		);
		copy.pairing = this.pairing;
		copy.requiresPassword = this.requiresPassword;
		return copy;
	}
}

// --- AbstractPushUpdater ---

export abstract class AbstractPushUpdater extends PushUpdater {
	stateDispatcher: ProtocolStateDispatcher;
	private _previousState: Playing | null = null;

	constructor(stateDispatcher: ProtocolStateDispatcher) {
		super();
		this.stateDispatcher = stateDispatcher;
	}

	postUpdate(playing: Playing): void {
		if (!this._previousState || !playing.equals(this._previousState)) {
			// Dispatch message using message dispatcher
			this.stateDispatcher.dispatch(UpdatedState.Playing, playing);

			// Publish using regular (external) interface
			queueMicrotask(() => {
				this.listener.playstatusUpdate(this, playing);
			});
		}
		this._previousState = playing;
	}
}

// --- SetupData ---

export interface SetupData {
	protocol: Protocol;
	connect: () => Promise<boolean>;
	close: () => Set<Promise<void>>;
	deviceInfo: () => Record<string, unknown>;
	interfaces: Map<unknown, unknown>;
	features: Set<FeatureName>;
}

// --- Core ---

export class Core {
	config: BaseConfig;
	service: BaseService;
	settings: Settings;
	deviceListener: StateProducer<object>;
	sessionManager: ClientSessionManager;
	takeover: TakeoverMethod;
	stateDispatcher: ProtocolStateDispatcher;

	constructor(
		config: BaseConfig,
		service: BaseService,
		settings: Settings,
		deviceListener: StateProducer<object>,
		sessionManager: ClientSessionManager,
		takeover: TakeoverMethod,
		stateDispatcher: ProtocolStateDispatcher,
	) {
		this.config = config;
		this.service = service;
		this.settings = settings;
		this.deviceListener = deviceListener;
		this.sessionManager = sessionManager;
		this.takeover = takeover;
		this.stateDispatcher = stateDispatcher;
	}
}

// --- createCore ---

export async function createCore(
	config: BaseConfig,
	service: BaseService,
	options?: {
		settings?: Settings;
		deviceListener?: StateProducer<object>;
		sessionManager?: ClientSessionManager;
		coreDispatcher?: CoreStateDispatcher;
		takeoverMethod?: TakeoverMethod;
	},
): Promise<Core> {
	const settings = options?.settings ?? ({} as Settings);
	const deviceListener = options?.deviceListener ?? new StateProducer();
	const sessionManager = options?.sessionManager ?? (await createSession());
	const coreDispatcher =
		options?.coreDispatcher ??
		new MessageDispatcher<UpdatedState, StateMessage>();
	const takeoverMethod = options?.takeoverMethod ?? (() => () => {});

	return new Core(
		config,
		service,
		settings,
		deviceListener,
		sessionManager,
		takeoverMethod,
		new ProtocolStateDispatcher(service.protocol, coreDispatcher),
	);
}

// --- OutputDeviceState ---

export class OutputDeviceState {
	identifier: string;
	volume: number;

	constructor(identifier: string, volume = 0.0) {
		this.identifier = identifier;
		this.volume = volume;
	}

	toString(): string {
		return `Device: ${this.identifier} (${this.volume})`;
	}

	equals(other: OutputDeviceState): boolean {
		return this.identifier === other.identifier && this.volume === other.volume;
	}
}
