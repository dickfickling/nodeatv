import { describe, expect, it } from "vitest";
import {
	DeviceState,
	FeatureName,
	FeatureState,
	MediaType,
	RepeatState,
	ShuffleState,
} from "../../../src/const.js";
import {
	buildPlayingInstance,
	MrpFeatures,
	scan,
} from "../../../src/protocols/mrp/index.js";
import {
	Command,
	ProtoRepeatMode,
	ProtoShuffleMode,
} from "../../../src/protocols/mrp/messages.js";
import {
	Client,
	PlaybackState,
	PlayerState,
	PlayerStateManager,
} from "../../../src/protocols/mrp/playerState.js";
import type { MrpProtocol } from "../../../src/protocols/mrp/protocol.js";

function makeMockProtocol(): MrpProtocol {
	return {
		listenTo() {},
	} as unknown as MrpProtocol;
}

function makePlayerState(
	opts: {
		playbackState?: number;
		metadata?: Record<string, unknown>;
		commands?: Array<{
			command: number;
			enabled?: boolean;
			shuffleMode?: number;
			repeatMode?: number;
			preferredIntervals?: number[];
		}>;
		itemIdentifier?: string;
	} = {},
): PlayerState {
	const client = new Client({ bundleIdentifier: "com.test" });
	const ps = new PlayerState(client, { identifier: "player-1" });

	const setStateMsg: Record<string, unknown> = {};

	if (opts.playbackState !== undefined) {
		setStateMsg.playbackState = opts.playbackState;
	}

	if (opts.metadata || opts.itemIdentifier) {
		setStateMsg.playbackQueue = {
			contentItems: [
				{
					identifier: opts.itemIdentifier ?? "item-1",
					metadata: opts.metadata ?? {},
				},
			],
			location: 0,
		};
	}

	if (opts.commands) {
		setStateMsg.supportedCommands = {
			supportedCommands: opts.commands,
		};
	}

	ps.handleSetState(setStateMsg);
	return ps;
}

describe("scan", () => {
	it("returns handler for mediaremotetv service type", () => {
		const handlers = scan();
		expect(handlers).toHaveProperty("_mediaremotetv._tcp.local");
	});

	it("returns exactly one service type", () => {
		const handlers = scan();
		expect(Object.keys(handlers)).toHaveLength(1);
	});
});

describe("buildPlayingInstance", () => {
	it("returns idle state for empty player", () => {
		const ps = makePlayerState();
		const playing = buildPlayingInstance(ps);
		expect(playing.deviceState).toBe(DeviceState.Idle);
		expect(playing.mediaType).toBe(MediaType.Unknown);
	});

	it("returns playing state", () => {
		const ps = makePlayerState({
			playbackState: PlaybackState.Playing,
			metadata: {
				title: "Test Song",
				trackArtistName: "Test Artist",
				albumName: "Test Album",
				genre: "Rock",
				duration: 180,
				mediaType: 1, // Audio
			},
		});
		const playing = buildPlayingInstance(ps);
		expect(playing.deviceState).toBe(DeviceState.Playing);
		expect(playing.mediaType).toBe(MediaType.Music);
		expect(playing.title).toBe("Test Song");
		expect(playing.artist).toBe("Test Artist");
		expect(playing.album).toBe("Test Album");
		expect(playing.genre).toBe("Rock");
		expect(playing.totalTime).toBe(180);
	});

	it("maps video media type", () => {
		const ps = makePlayerState({
			playbackState: PlaybackState.Playing,
			metadata: { mediaType: 2 },
		});
		const playing = buildPlayingInstance(ps);
		expect(playing.mediaType).toBe(MediaType.Video);
	});

	it("maps playback states correctly", () => {
		const stateMap: [number, DeviceState][] = [
			[PlaybackState.Playing, DeviceState.Playing],
			[PlaybackState.Stopped, DeviceState.Stopped],
			[PlaybackState.Interrupted, DeviceState.Loading],
			[PlaybackState.Seeking, DeviceState.Seeking],
		];

		for (const [pbState, expected] of stateMap) {
			const ps = makePlayerState({
				playbackState: pbState,
				metadata: { title: "x" },
			});
			const playing = buildPlayingInstance(ps);
			expect(playing.deviceState).toBe(expected);
		}
	});

	it("paused state maps to DeviceState.Paused", () => {
		const ps = makePlayerState({
			playbackState: PlaybackState.Paused,
			metadata: { title: "Song" },
		});
		const playing = buildPlayingInstance(ps);
		expect(playing.deviceState).toBe(DeviceState.Paused);
	});

	it("reads shuffle state from command info", () => {
		const ps = makePlayerState({
			commands: [
				{
					command: Command.ChangeShuffleMode,
					enabled: true,
					shuffleMode: ProtoShuffleMode.Songs,
				},
			],
		});
		const playing = buildPlayingInstance(ps);
		expect(playing.shuffle).toBe(ShuffleState.Songs);
	});

	it("reads repeat state from command info", () => {
		const ps = makePlayerState({
			commands: [
				{
					command: Command.ChangeRepeatMode,
					enabled: true,
					repeatMode: ProtoRepeatMode.All,
				},
			],
		});
		const playing = buildPlayingInstance(ps);
		expect(playing.repeat).toBe(RepeatState.All);
	});

	it("defaults shuffle and repeat to Off", () => {
		const ps = makePlayerState({});
		const playing = buildPlayingInstance(ps);
		expect(playing.shuffle).toBe(ShuffleState.Off);
		expect(playing.repeat).toBe(RepeatState.Off);
	});

	it("includes content identifier and hash", () => {
		const ps = makePlayerState({
			metadata: { contentIdentifier: "content-123" },
			itemIdentifier: "hash-abc",
		});
		const playing = buildPlayingInstance(ps);
		expect(playing.contentIdentifier).toBe("content-123");
		expect(playing.hash).toBe("hash-abc");
	});
});

describe("MrpFeatures", () => {
	function makeFeatures(
		playerOpts: Parameters<typeof makePlayerState>[0] = {},
	): MrpFeatures {
		const protocol = makeMockProtocol();
		const psm = new PlayerStateManager(protocol);

		// Set up a client and player with state
		const client = psm.getClient({ bundleIdentifier: "com.test" });
		const player = client.getPlayer({ identifier: "p1" });

		const setStateMsg: Record<string, unknown> = {};
		if (playerOpts.playbackState !== undefined) {
			setStateMsg.playbackState = playerOpts.playbackState;
		}
		if (playerOpts.metadata) {
			setStateMsg.playbackQueue = {
				contentItems: [{ identifier: "item-1", metadata: playerOpts.metadata }],
				location: 0,
			};
		}
		if (playerOpts.commands) {
			setStateMsg.supportedCommands = {
				supportedCommands: playerOpts.commands,
			};
		}
		player.handleSetState(setStateMsg);
		client.handleSetNowPlayingPlayer({ identifier: "p1" });

		// Need to set active client on psm
		// Use _handleSetNowPlayingClient via getClient
		(psm as unknown as { _activeClient: Client })._activeClient = client;

		return new MrpFeatures({ address: "", identifier: "" }, psm);
	}

	it("returns Available for always-supported features", () => {
		const features = makeFeatures();
		const alwaysAvailable = [
			FeatureName.Up,
			FeatureName.Down,
			FeatureName.Left,
			FeatureName.Right,
			FeatureName.Select,
			FeatureName.Menu,
			FeatureName.Home,
			FeatureName.HomeHold,
			FeatureName.TopMenu,
			FeatureName.TurnOn,
			FeatureName.TurnOff,
			FeatureName.PowerState,
		];
		for (const f of alwaysAvailable) {
			expect(features.getFeature(f).state).toBe(FeatureState.Available);
		}
	});

	it("returns Available for title when metadata has title", () => {
		const features = makeFeatures({
			metadata: { title: "Song" },
		});
		expect(features.getFeature(FeatureName.Title).state).toBe(
			FeatureState.Available,
		);
	});

	it("returns Unavailable for title when metadata missing", () => {
		const features = makeFeatures();
		expect(features.getFeature(FeatureName.Title).state).toBe(
			FeatureState.Unavailable,
		);
	});

	it("returns Available for command-based features when enabled", () => {
		const features = makeFeatures({
			commands: [
				{ command: Command.Play, enabled: true },
				{ command: Command.Pause, enabled: true },
			],
		});
		expect(features.getFeature(FeatureName.Play).state).toBe(
			FeatureState.Available,
		);
		expect(features.getFeature(FeatureName.Pause).state).toBe(
			FeatureState.Available,
		);
	});

	it("returns Unavailable for command-based features when not enabled", () => {
		const features = makeFeatures({
			commands: [{ command: Command.Play, enabled: false }],
		});
		expect(features.getFeature(FeatureName.Play).state).toBe(
			FeatureState.Unavailable,
		);
	});

	it("returns Unknown for VolumeUp/VolumeDown", () => {
		const features = makeFeatures();
		expect(features.getFeature(FeatureName.VolumeUp).state).toBe(
			FeatureState.Unknown,
		);
		expect(features.getFeature(FeatureName.VolumeDown).state).toBe(
			FeatureState.Unknown,
		);
	});

	it("returns Available for App when active client exists", () => {
		const features = makeFeatures();
		expect(features.getFeature(FeatureName.App).state).toBe(
			FeatureState.Available,
		);
	});

	it("returns Available for artwork when artworkAvailable", () => {
		const features = makeFeatures({
			metadata: { artworkAvailable: true },
		});
		expect(features.getFeature(FeatureName.Artwork).state).toBe(
			FeatureState.Available,
		);
	});

	it("returns Unavailable for artwork when not available", () => {
		const features = makeFeatures({
			metadata: { title: "Song" },
		});
		expect(features.getFeature(FeatureName.Artwork).state).toBe(
			FeatureState.Unavailable,
		);
	});
});
