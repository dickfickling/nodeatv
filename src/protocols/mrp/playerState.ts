/**
 * Module responsible for keeping track of media player states.
 */

import type { ProtocolMessageObj } from "./protobuf/index.js";
import * as protobuf from "./protobuf/index.js";
import type { MrpProtocol } from "./protocol.js";

const DEFAULT_PLAYER_ID = "MediaRemote-DefaultPlayer";

// --- Protobuf PlaybackState enum values ---
export const PlaybackState = {
	Unknown: 0,
	Playing: 1,
	Paused: 2,
	Stopped: 3,
	Interrupted: 4,
	Seeking: 5,
} as const;

// --- Helper types for decoded protobuf messages ---

interface ContentItemMetadata {
	title?: string;
	trackArtistName?: string;
	albumName?: string;
	genre?: string;
	duration?: number;
	elapsedTimeTimestamp?: number;
	elapsedTime?: number;
	playbackRate?: number;
	mediaType?: number;
	artworkAvailable?: boolean;
	artworkMIMEType?: string;
	artworkIdentifier?: string;
	artworkURL?: string;
	contentIdentifier?: string;
	iTunesStoreIdentifier?: number;
	seriesName?: string;
	seasonNumber?: number;
	episodeNumber?: number;
	[key: string]: unknown;
}

interface ContentItem {
	identifier?: string;
	metadata?: ContentItemMetadata;
	artworkData?: Buffer;
	artworkDataWidth?: number;
	artworkDataHeight?: number;
	[key: string]: unknown;
}

interface PlaybackQueue {
	contentItems?: ContentItem[];
	location?: number;
	[key: string]: unknown;
}

interface SupportedCommands {
	supportedCommands?: CommandInfo[];
	[key: string]: unknown;
}

interface CommandInfo {
	command?: number;
	enabled?: boolean;
	repeatMode?: number;
	shuffleMode?: number;
	preferredIntervals?: number[];
	[key: string]: unknown;
}

interface NowPlayingPlayer {
	identifier?: string;
	displayName?: string;
	[key: string]: unknown;
}

interface NowPlayingClient {
	bundleIdentifier?: string;
	displayName?: string;
	[key: string]: unknown;
}

interface PlayerPath {
	client?: NowPlayingClient;
	player?: NowPlayingPlayer;
	[key: string]: unknown;
}

interface SetStateInner {
	playbackState?: number;
	supportedCommands?: SupportedCommands;
	playbackQueue?: PlaybackQueue;
	playerPath?: PlayerPath;
	[key: string]: unknown;
}

interface SetNowPlayingClientInner {
	client?: NowPlayingClient;
	[key: string]: unknown;
}

interface SetNowPlayingPlayerInner {
	playerPath?: PlayerPath;
	[key: string]: unknown;
}

interface UpdateContentItemInner {
	contentItems?: ContentItem[];
	playerPath?: PlayerPath;
	[key: string]: unknown;
}

interface UpdateClientInner {
	client?: NowPlayingClient;
	[key: string]: unknown;
}

interface RemoveClientInner {
	client?: NowPlayingClient;
	[key: string]: unknown;
}

interface RemovePlayerInner {
	playerPath?: PlayerPath;
	[key: string]: unknown;
}

interface SetDefaultSupportedCommandsInner {
	playerPath?: PlayerPath;
	supportedCommands?: SupportedCommands;
	[key: string]: unknown;
}

/**
 * Represents what is currently playing on a device.
 */
export class PlayerState {
	private _playbackState: number | null = null;
	supportedCommands: CommandInfo[] = [];
	items: ContentItem[] = [];
	location = 0;
	identifier: string | null;
	displayName: string | null = null;
	parent: Client | null;

	constructor(parent: Client, player: NowPlayingPlayer) {
		this.identifier = player.identifier ?? null;
		this.parent = parent;
		this.update(player);
	}

	get isValid(): boolean {
		return this.identifier !== null && this.identifier !== "";
	}

	update(player: NowPlayingPlayer): void {
		if (player.displayName) {
			this.displayName = player.displayName;
		}
	}

	get playbackState(): number | null {
		if (this._playbackState === null) {
			return null;
		}

		if (this._playbackState === PlaybackState.Paused) {
			if (this.metadata !== null) {
				return PlaybackState.Paused;
			}
			return null;
		}

		if (this._playbackState !== PlaybackState.Playing) {
			return this._playbackState;
		}

		const playbackRate = this.metadataField("playbackRate") as number | null;
		if (playbackRate === null) {
			return this._playbackState;
		}

		if (Math.abs(playbackRate) < 0.001) {
			if (this._playbackState === PlaybackState.Playing) {
				return PlaybackState.Playing;
			}
			return PlaybackState.Paused;
		}
		if (Math.abs(playbackRate - 1.0) < 0.001) {
			return PlaybackState.Playing;
		}
		return PlaybackState.Seeking;
	}

	get metadata(): ContentItemMetadata | null {
		if (this.items.length >= this.location + 1) {
			return this.items[this.location]?.metadata ?? null;
		}
		return null;
	}

	get itemIdentifier(): string | null {
		if (this.items.length >= this.location + 1) {
			return this.items[this.location]?.identifier ?? null;
		}
		return null;
	}

	metadataField(field: string): unknown {
		const metadata = this.metadata;
		if (metadata && field in metadata) {
			return metadata[field as keyof ContentItemMetadata];
		}
		return null;
	}

	commandInfo(command: number): CommandInfo | null {
		const parentCommands = this.parent?.supportedCommands ?? [];
		for (const cmd of [...this.supportedCommands, ...parentCommands]) {
			if (cmd.command === command) {
				return cmd;
			}
		}
		return null;
	}

	handleSetState(setstate: SetStateInner): void {
		if (setstate.playbackState !== undefined) {
			this._playbackState = setstate.playbackState;
		}

		if (setstate.supportedCommands) {
			this.supportedCommands =
				setstate.supportedCommands.supportedCommands ?? [];
		}

		if (setstate.playbackQueue) {
			const queue = setstate.playbackQueue;
			this.items = queue.contentItems ?? [];
			this.location = queue.location ?? 0;
		}
	}

	handleContentItemUpdate(itemUpdate: UpdateContentItemInner): void {
		const updatedItems = itemUpdate.contentItems ?? [];
		for (const updatedItem of updatedItems) {
			for (const existing of this.items) {
				if (
					updatedItem.identifier &&
					updatedItem.identifier === existing.identifier
				) {
					if (updatedItem.metadata && existing.metadata) {
						Object.assign(existing.metadata, updatedItem.metadata);
					}
				}
			}
		}
	}
}

/**
 * Represents an MRP media player client.
 */
export class Client {
	bundleIdentifier: string;
	displayName: string | null = null;
	private _activePlayer: PlayerState | null = null;
	players: Map<string, PlayerState> = new Map();
	supportedCommands: CommandInfo[] = [];

	constructor(client: NowPlayingClient) {
		this.bundleIdentifier = client.bundleIdentifier ?? "";
		this.update(client);
	}

	get activePlayer(): PlayerState {
		if (this._activePlayer !== null) {
			return this._activePlayer;
		}
		const defaultPlayer = this.players.get(DEFAULT_PLAYER_ID);
		if (defaultPlayer) {
			return defaultPlayer;
		}
		return new PlayerState(this, {});
	}

	set activePlayer(player: PlayerState | null) {
		this._activePlayer = player;
	}

	getPlayer(player: NowPlayingPlayer): PlayerState {
		const id = player.identifier ?? "";
		if (!this.players.has(id)) {
			this.players.set(id, new PlayerState(this, player));
		}
		return this.players.get(id)!;
	}

	handleSetDefaultSupportedCommands(
		supportedCommands: SetDefaultSupportedCommandsInner,
	): void {
		this.supportedCommands =
			supportedCommands.supportedCommands?.supportedCommands ?? [];
	}

	handleSetNowPlayingPlayer(player: NowPlayingPlayer): void {
		this.activePlayer = this.getPlayer(player);
	}

	update(client: NowPlayingClient): void {
		if (client.displayName) {
			this.displayName = client.displayName;
		}
	}
}

/**
 * Listener interface for player state updates.
 */
export interface PlayerStateListener {
	stateUpdated(): Promise<void>;
}

/**
 * Manages state of all media players.
 */
export class PlayerStateManager {
	protocol: MrpProtocol;
	volumeControlsAvailable: boolean | null = null;
	private _activeClient: Client | null = null;
	private _clients: Map<string, Client> = new Map();
	private _listener: WeakRef<PlayerStateListener> | null = null;

	constructor(protocol: MrpProtocol) {
		this.protocol = protocol;
		this._addListeners();
	}

	private _addListeners(): void {
		const listeners: Array<
			[number, (msg: ProtocolMessageObj) => Promise<void>]
		> = [
			[protobuf.SET_STATE_MESSAGE, (m) => this._handleSetState(m)],
			[
				protobuf.UPDATE_CONTENT_ITEM_MESSAGE,
				(m) => this._handleContentItemUpdate(m),
			],
			[
				protobuf.SET_NOW_PLAYING_CLIENT_MESSAGE,
				(m) => this._handleSetNowPlayingClient(m),
			],
			[
				protobuf.SET_NOW_PLAYING_PLAYER_MESSAGE,
				(m) => this._handleSetNowPlayingPlayer(m),
			],
			[protobuf.UPDATE_CLIENT_MESSAGE, (m) => this._handleUpdateClient(m)],
			[protobuf.REMOVE_CLIENT_MESSAGE, (m) => this._handleRemoveClient(m)],
			[protobuf.REMOVE_PLAYER_MESSAGE, (m) => this._handleRemovePlayer(m)],
			[
				protobuf.SET_DEFAULT_SUPPORTED_COMMANDS_MESSAGE,
				(m) => this._handleSetDefaultSupportedCommands(m),
			],
		];

		for (const [messageType, handler] of listeners) {
			this.protocol.listenTo(messageType, handler);
		}
	}

	getClient(client: NowPlayingClient): Client {
		const bundle = client.bundleIdentifier ?? "";
		if (!this._clients.has(bundle)) {
			this._clients.set(bundle, new Client(client));
		}
		return this._clients.get(bundle)!;
	}

	getPlayer(playerPath: PlayerPath): PlayerState {
		return this.getClient(playerPath.client ?? {}).getPlayer(
			playerPath.player ?? {},
		);
	}

	get listener(): PlayerStateListener | null {
		if (this._listener === null) return null;
		return this._listener.deref() ?? null;
	}

	set listener(newListener: PlayerStateListener | null) {
		if (newListener !== null) {
			this._listener = new WeakRef(newListener);
		} else {
			this._listener = null;
		}
	}

	get client(): Client | null {
		return this._activeClient;
	}

	get playing(): PlayerState {
		if (this._activeClient) {
			return this._activeClient.activePlayer;
		}
		return new PlayerState(new Client({}), {});
	}

	private _getInner(
		message: ProtocolMessageObj,
	): Record<string, unknown> | null {
		const fieldName = protobuf.EXTENSION_LOOKUP[message.type ?? 0];
		if (!fieldName) return null;
		return (message[fieldName] as Record<string, unknown>) ?? null;
	}

	private async _handleSetState(message: ProtocolMessageObj): Promise<void> {
		const setstate = this._getInner(message) as SetStateInner | null;
		if (!setstate?.playerPath) return;

		const player = this.getPlayer(setstate.playerPath);
		player.handleSetState(setstate);

		await this._stateUpdated(undefined, player);
	}

	private async _handleContentItemUpdate(
		message: ProtocolMessageObj,
	): Promise<void> {
		const itemUpdate = this._getInner(message) as UpdateContentItemInner | null;
		if (!itemUpdate?.playerPath) return;

		const player = this.getPlayer(itemUpdate.playerPath);
		player.handleContentItemUpdate(itemUpdate);

		await this._stateUpdated(undefined, player);
	}

	private async _handleSetNowPlayingClient(
		message: ProtocolMessageObj,
	): Promise<void> {
		const inner = this._getInner(message) as SetNowPlayingClientInner | null;
		if (!inner?.client) return;

		this._activeClient = this.getClient(inner.client);
		await this._stateUpdated();
	}

	private async _handleSetNowPlayingPlayer(
		message: ProtocolMessageObj,
	): Promise<void> {
		const inner = this._getInner(message) as SetNowPlayingPlayerInner | null;
		if (!inner?.playerPath) return;

		const client = this.getClient(inner.playerPath.client ?? {});
		client.handleSetNowPlayingPlayer(inner.playerPath.player ?? {});

		await this._stateUpdated(client);
	}

	private async _handleRemoveClient(
		message: ProtocolMessageObj,
	): Promise<void> {
		const inner = this._getInner(message) as RemoveClientInner | null;
		if (!inner?.client?.bundleIdentifier) return;

		const bundleId = inner.client.bundleIdentifier;
		if (this._clients.has(bundleId)) {
			const client = this._clients.get(bundleId)!;
			this._clients.delete(bundleId);

			if (client === this._activeClient) {
				this._activeClient = null;
				await this._stateUpdated();
			}
		}
	}

	private async _handleRemovePlayer(
		message: ProtocolMessageObj,
	): Promise<void> {
		const inner = this._getInner(message) as RemovePlayerInner | null;
		if (!inner?.playerPath) return;

		const player = this.getPlayer(inner.playerPath);
		if (player.isValid) {
			const client = this.getClient(inner.playerPath.client ?? {});
			if (player.identifier) {
				client.players.delete(player.identifier);
			}
			player.parent = null;

			if (player === client.activePlayer) {
				client.activePlayer = null;
				await this._stateUpdated(client);
			}
		}
	}

	private async _handleSetDefaultSupportedCommands(
		message: ProtocolMessageObj,
	): Promise<void> {
		const inner = this._getInner(
			message,
		) as SetDefaultSupportedCommandsInner | null;
		if (!inner?.playerPath) return;

		const client = this.getClient(inner.playerPath.client ?? {});
		client.handleSetDefaultSupportedCommands(inner);

		await this._stateUpdated();
	}

	private async _handleUpdateClient(
		message: ProtocolMessageObj,
	): Promise<void> {
		const inner = this._getInner(message) as UpdateClientInner | null;
		if (!inner?.client) return;

		const client = this.getClient(inner.client);
		client.update(inner.client);

		await this._stateUpdated(client);
	}

	private async _stateUpdated(
		client?: Client,
		player?: PlayerState,
	): Promise<void> {
		const isActiveClient = client !== undefined && client === this.client;
		const isActivePlayer = player !== undefined && player === this.playing;
		const isAlways = client === undefined && player === undefined;

		if (isActiveClient || isActivePlayer || isAlways) {
			const listener = this.listener;
			if (listener) {
				await listener.stateUpdated();
			}
		}
	}
}
