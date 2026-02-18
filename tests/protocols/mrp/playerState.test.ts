import { describe, expect, it } from "vitest";
import {
	Client,
	PlaybackState,
	PlayerState,
	PlayerStateManager,
} from "../../../src/protocols/mrp/playerState.js";
import type { MrpProtocol } from "../../../src/protocols/mrp/protocol.js";

function makeMockProtocol(): MrpProtocol {
	const listeners = new Map<number, Array<(msg: unknown) => Promise<void>>>();
	return {
		listenTo(
			messageType: number,
			handler: (msg: unknown) => Promise<void>,
		): void {
			if (!listeners.has(messageType)) {
				listeners.set(messageType, []);
			}
			listeners.get(messageType)?.push(handler);
		},
		_listeners: listeners,
	} as unknown as MrpProtocol;
}

describe("PlaybackState constants", () => {
	it("has expected values", () => {
		expect(PlaybackState.Unknown).toBe(0);
		expect(PlaybackState.Playing).toBe(1);
		expect(PlaybackState.Paused).toBe(2);
		expect(PlaybackState.Stopped).toBe(3);
		expect(PlaybackState.Interrupted).toBe(4);
		expect(PlaybackState.Seeking).toBe(5);
	});
});

describe("PlayerState", () => {
	it("initializes with identifier from player", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		const ps = new PlayerState(client, {
			identifier: "player-1",
			displayName: "TestPlayer",
		});
		expect(ps.identifier).toBe("player-1");
		expect(ps.displayName).toBe("TestPlayer");
		expect(ps.isValid).toBe(true);
	});

	it("isValid returns false for empty identifier", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		const ps = new PlayerState(client, {});
		expect(ps.isValid).toBe(false);
	});

	it("returns null playbackState when not set", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		const ps = new PlayerState(client, { identifier: "p1" });
		expect(ps.playbackState).toBeNull();
	});

	it("tracks playbackState from handleSetState", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		const ps = new PlayerState(client, { identifier: "p1" });

		ps.handleSetState({ playbackState: PlaybackState.Playing });
		expect(ps.playbackState).toBe(PlaybackState.Playing);

		ps.handleSetState({ playbackState: PlaybackState.Paused });
		// Paused with no metadata returns null
		expect(ps.playbackState).toBeNull();
	});

	it("returns paused when paused with metadata", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		const ps = new PlayerState(client, { identifier: "p1" });

		ps.handleSetState({
			playbackState: PlaybackState.Paused,
			playbackQueue: {
				contentItems: [{ identifier: "item1", metadata: { title: "Song" } }],
				location: 0,
			},
		});
		expect(ps.playbackState).toBe(PlaybackState.Paused);
	});

	it("tracks nowPlaying metadata via playbackQueue", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		const ps = new PlayerState(client, { identifier: "p1" });

		ps.handleSetState({
			playbackQueue: {
				contentItems: [
					{
						identifier: "item1",
						metadata: {
							title: "Test Song",
							trackArtistName: "Test Artist",
							albumName: "Test Album",
							duration: 180,
						},
					},
				],
				location: 0,
			},
		});

		expect(ps.metadata).toBeDefined();
		expect(ps.metadata?.title).toBe("Test Song");
		expect(ps.metadataField("title")).toBe("Test Song");
		expect(ps.metadataField("trackArtistName")).toBe("Test Artist");
		expect(ps.metadataField("albumName")).toBe("Test Album");
		expect(ps.metadataField("duration")).toBe(180);
		expect(ps.itemIdentifier).toBe("item1");
	});

	it("returns null metadata when no items", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		const ps = new PlayerState(client, { identifier: "p1" });
		expect(ps.metadata).toBeNull();
		expect(ps.metadataField("title")).toBeNull();
		expect(ps.itemIdentifier).toBeNull();
	});

	it("tracks supported commands", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		const ps = new PlayerState(client, { identifier: "p1" });

		ps.handleSetState({
			supportedCommands: {
				supportedCommands: [
					{ command: 1, enabled: true },
					{ command: 47, enabled: true, shuffleMode: 3 },
				],
			},
		});

		expect(ps.commandInfo(1)).toEqual({ command: 1, enabled: true });
		expect(ps.commandInfo(47)?.shuffleMode).toBe(3);
		expect(ps.commandInfo(999)).toBeNull();
	});

	it("handleContentItemUpdate updates existing items", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		const ps = new PlayerState(client, { identifier: "p1" });

		ps.handleSetState({
			playbackQueue: {
				contentItems: [
					{
						identifier: "item1",
						metadata: { title: "Old Title", trackArtistName: "Artist" },
					},
				],
				location: 0,
			},
		});

		ps.handleContentItemUpdate({
			contentItems: [
				{
					identifier: "item1",
					metadata: { title: "New Title" },
				},
			],
		});

		expect(ps.metadata?.title).toBe("New Title");
		expect(ps.metadata?.trackArtistName).toBe("Artist");
	});
});

describe("Client", () => {
	it("creates with bundleIdentifier", () => {
		const client = new Client({
			bundleIdentifier: "com.apple.TVMusic",
			displayName: "Music",
		});
		expect(client.bundleIdentifier).toBe("com.apple.TVMusic");
		expect(client.displayName).toBe("Music");
	});

	it("getPlayer creates new player on first access", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		const player = client.getPlayer({ identifier: "p1" });
		expect(player.identifier).toBe("p1");
		expect(client.players.size).toBe(1);
	});

	it("getPlayer returns same player on repeated calls", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		const p1 = client.getPlayer({ identifier: "p1" });
		const p2 = client.getPlayer({ identifier: "p1" });
		expect(p1).toBe(p2);
	});

	it("activePlayer returns default player when none set", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		const active = client.activePlayer;
		expect(active).toBeDefined();
	});

	it("handleSetNowPlayingPlayer sets active player", () => {
		const client = new Client({ bundleIdentifier: "com.test" });
		client.handleSetNowPlayingPlayer({
			identifier: "player-1",
			displayName: "Player",
		});
		expect(client.activePlayer.identifier).toBe("player-1");
	});
});

describe("PlayerStateManager", () => {
	it("creates with protocol and registers listeners", () => {
		const protocol = makeMockProtocol();
		const psm = new PlayerStateManager(protocol);
		expect(psm.protocol).toBe(protocol);
		// Should have registered 8 listeners
		const mock = protocol as unknown as {
			_listeners: Map<number, unknown[]>;
		};
		expect(mock._listeners.size).toBe(8);
	});

	it("returns empty playing state when no active client", () => {
		const protocol = makeMockProtocol();
		const psm = new PlayerStateManager(protocol);
		const playing = psm.playing;
		expect(playing).toBeDefined();
		expect(playing.playbackState).toBeNull();
	});

	it("getClient creates new client on first access", () => {
		const protocol = makeMockProtocol();
		const psm = new PlayerStateManager(protocol);
		const client = psm.getClient({
			bundleIdentifier: "com.test",
			displayName: "Test",
		});
		expect(client.bundleIdentifier).toBe("com.test");
		expect(client.displayName).toBe("Test");
	});

	it("getPlayer creates player via client", () => {
		const protocol = makeMockProtocol();
		const psm = new PlayerStateManager(protocol);
		const player = psm.getPlayer({
			client: { bundleIdentifier: "com.test" },
			player: { identifier: "p1" },
		});
		expect(player.identifier).toBe("p1");
	});

	it("listener can be set and retrieved", () => {
		const protocol = makeMockProtocol();
		const psm = new PlayerStateManager(protocol);

		expect(psm.listener).toBeNull();

		const listener = {
			stateUpdated: async () => {},
		};
		psm.listener = listener;
		expect(psm.listener).toBe(listener);

		psm.listener = null;
		expect(psm.listener).toBeNull();
	});

	it("client returns null when no active client", () => {
		const protocol = makeMockProtocol();
		const psm = new PlayerStateManager(protocol);
		expect(psm.client).toBeNull();
	});
});
