import { describe, expect, it } from "vitest";
import { RepeatState, ShuffleState } from "../../../src/const.js";
import {
	addOutputDevices,
	Command,
	clientUpdatesConfig,
	commandResult,
	create,
	cryptoPairing,
	deviceInformation,
	ProtoRepeatMode,
	ProtoShuffleMode,
	playbackQueueRequest,
	removeOutputDevices,
	repeat,
	seekToPosition,
	sendButton,
	sendCommand,
	sendHidEvent,
	setConnectionState,
	setOutputDevices,
	setVolume,
	shuffle,
	wakeDevice,
} from "../../../src/protocols/mrp/messages.js";
import {
	CLIENT_UPDATES_CONFIG_MESSAGE,
	CRYPTO_PAIRING_MESSAGE,
	DEVICE_INFO_MESSAGE,
	DEVICE_INFO_UPDATE_MESSAGE,
	GENERIC_MESSAGE,
	MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE,
	PLAYBACK_QUEUE_REQUEST_MESSAGE,
	SEND_BUTTON_EVENT_MESSAGE,
	SEND_COMMAND_MESSAGE,
	SEND_COMMAND_RESULT_MESSAGE,
	SEND_HID_EVENT_MESSAGE,
	SET_CONNECTION_STATE_MESSAGE,
	SET_VOLUME_MESSAGE,
	WAKE_DEVICE_MESSAGE,
} from "../../../src/protocols/mrp/protobuf/index.js";

describe("create", () => {
	it("creates a message with the given type", () => {
		const msg = create(GENERIC_MESSAGE);
		expect(msg.type).toBe(GENERIC_MESSAGE);
		expect(msg.errorCode).toBe(0);
		expect(msg.uniqueIdentifier).toBeDefined();
	});

	it("creates a message with custom error code", () => {
		const msg = create(GENERIC_MESSAGE, 42);
		expect(msg.errorCode).toBe(42);
	});

	it("creates a message with identifier", () => {
		const msg = create(GENERIC_MESSAGE, 0, "test-id");
		expect(msg.identifier).toBe("test-id");
	});

	it("omits identifier when not provided", () => {
		const msg = create(GENERIC_MESSAGE);
		expect(msg.identifier).toBeUndefined();
	});

	it("generates unique identifiers", () => {
		const msg1 = create(GENERIC_MESSAGE);
		const msg2 = create(GENERIC_MESSAGE);
		expect(msg1.uniqueIdentifier).not.toBe(msg2.uniqueIdentifier);
	});
});

describe("deviceInformation", () => {
	it("creates a DEVICE_INFO_MESSAGE", () => {
		const msg = deviceInformation("MyRemote", "device-123");
		expect(msg.type).toBe(DEVICE_INFO_MESSAGE);
		const inner = msg.deviceInfoMessage as Record<string, unknown>;
		expect(inner).toBeDefined();
		expect(inner.name).toBe("MyRemote");
		expect(inner.uniqueIdentifier).toBe("device-123");
		expect(inner.allowsPairing).toBe(true);
		expect(inner.protocolVersion).toBe(1);
	});

	it("creates a DEVICE_INFO_UPDATE_MESSAGE when update=true", () => {
		const msg = deviceInformation("MyRemote", "device-123", "18G82", true);
		expect(msg.type).toBe(DEVICE_INFO_UPDATE_MESSAGE);
	});

	it("uses custom OS build", () => {
		const msg = deviceInformation("MyRemote", "device-123", "20A100");
		const inner = msg.deviceInfoMessage as Record<string, unknown>;
		expect(inner.systemBuildVersion).toBe("20A100");
	});
});

describe("sendCommand", () => {
	it("creates a SEND_COMMAND_MESSAGE with command", () => {
		const msg = sendCommand(Command.Play);
		expect(msg.type).toBe(SEND_COMMAND_MESSAGE);
		const inner = msg.sendCommandMessage as Record<string, unknown>;
		expect(inner.command).toBe(Command.Play);
	});

	it("includes options when provided", () => {
		const msg = sendCommand(Command.SeekToPlaybackPosition, {
			playbackPosition: 42,
		});
		const inner = msg.sendCommandMessage as Record<string, unknown>;
		const options = inner.options as Record<string, unknown>;
		expect(options.playbackPosition).toBe(42);
	});

	it("provides empty options when none given", () => {
		const msg = sendCommand(Command.Pause);
		const inner = msg.sendCommandMessage as Record<string, unknown>;
		expect(inner.options).toEqual({});
	});
});

describe("commandResult", () => {
	it("creates a SEND_COMMAND_RESULT_MESSAGE", () => {
		const msg = commandResult("req-123");
		expect(msg.type).toBe(SEND_COMMAND_RESULT_MESSAGE);
		expect(msg.identifier).toBe("req-123");
		const inner = msg.sendCommandResultMessage as Record<string, unknown>;
		expect(inner.sendError).toBe(0);
		expect(inner.handlerReturnStatus).toBe(0);
	});

	it("includes custom send error", () => {
		const msg = commandResult("req-123", 5);
		const inner = msg.sendCommandResultMessage as Record<string, unknown>;
		expect(inner.sendError).toBe(5);
	});
});

describe("setVolume", () => {
	it("creates a SET_VOLUME_MESSAGE", () => {
		const msg = setVolume("device-uid", 0.75);
		expect(msg.type).toBe(SET_VOLUME_MESSAGE);
		const inner = msg.setVolumeMessage as Record<string, unknown>;
		expect(inner.outputDeviceUID).toBe("device-uid");
		expect(inner.volume).toBe(0.75);
	});
});

describe("wakeDevice", () => {
	it("creates a WAKE_DEVICE_MESSAGE", () => {
		const msg = wakeDevice();
		expect(msg.type).toBe(WAKE_DEVICE_MESSAGE);
		expect(msg.wakeDeviceMessage).toEqual({});
	});
});

describe("setConnectionState", () => {
	it("creates a SET_CONNECTION_STATE_MESSAGE with state=2", () => {
		const msg = setConnectionState();
		expect(msg.type).toBe(SET_CONNECTION_STATE_MESSAGE);
		const inner = msg.setConnectionStateMessage as Record<string, unknown>;
		expect(inner.state).toBe(2);
	});
});

describe("clientUpdatesConfig", () => {
	it("creates with default parameters", () => {
		const msg = clientUpdatesConfig();
		expect(msg.type).toBe(CLIENT_UPDATES_CONFIG_MESSAGE);
		const inner = msg.clientUpdatesConfigMessage as Record<string, unknown>;
		expect(inner.artworkUpdates).toBe(true);
		expect(inner.nowPlayingUpdates).toBe(false);
		expect(inner.volumeUpdates).toBe(true);
		expect(inner.keyboardUpdates).toBe(true);
		expect(inner.outputDeviceUpdates).toBe(true);
	});

	it("accepts custom parameters", () => {
		const msg = clientUpdatesConfig(false, true, false, false, false);
		const inner = msg.clientUpdatesConfigMessage as Record<string, unknown>;
		expect(inner.artworkUpdates).toBe(false);
		expect(inner.nowPlayingUpdates).toBe(true);
	});
});

describe("playbackQueueRequest", () => {
	it("creates with location", () => {
		const msg = playbackQueueRequest(5);
		expect(msg.type).toBe(PLAYBACK_QUEUE_REQUEST_MESSAGE);
		const inner = msg.playbackQueueRequestMessage as Record<string, unknown>;
		expect(inner.location).toBe(5);
		expect(inner.length).toBe(1);
		expect(inner.artworkWidth).toBe(-1);
		expect(inner.artworkHeight).toBe(400);
	});
});

describe("sendHidEvent", () => {
	it("creates a SEND_HID_EVENT_MESSAGE", () => {
		const msg = sendHidEvent(1, 0x8c, true);
		expect(msg.type).toBe(SEND_HID_EVENT_MESSAGE);
		const inner = msg.sendHIDEventMessage as Record<string, unknown>;
		expect(inner.hidEventData).toBeInstanceOf(Buffer);
	});
});

describe("sendButton", () => {
	it("creates a SEND_BUTTON_EVENT_MESSAGE", () => {
		const msg = sendButton(1, 0x89, true);
		expect(msg.type).toBe(SEND_BUTTON_EVENT_MESSAGE);
		const inner = msg.sendButtonEventMessage as Record<string, unknown>;
		expect(inner.usagePage).toBe(1);
		expect(inner.usage).toBe(0x89);
		expect(inner.buttonDown).toBe(true);
	});
});

describe("cryptoPairing", () => {
	it("creates a CRYPTO_PAIRING_MESSAGE", () => {
		const pairingData = new Map<number, Buffer>();
		pairingData.set(6, Buffer.from([1, 2, 3]));
		const msg = cryptoPairing(pairingData);
		expect(msg.type).toBe(CRYPTO_PAIRING_MESSAGE);
		const inner = msg.cryptoPairingMessage as Record<string, unknown>;
		expect(inner.status).toBe(0);
		expect(inner.state).toBe(0);
	});

	it("sets state=2 when isPairing=true", () => {
		const pairingData = new Map<number, Buffer>();
		pairingData.set(6, Buffer.from([1]));
		const msg = cryptoPairing(pairingData, true);
		const inner = msg.cryptoPairingMessage as Record<string, unknown>;
		expect(inner.state).toBe(2);
	});
});

describe("repeat", () => {
	it("maps RepeatState.Off to ProtoRepeatMode.Off", () => {
		const msg = repeat(RepeatState.Off);
		const inner = msg.sendCommandMessage as Record<string, unknown>;
		expect(inner.command).toBe(Command.ChangeRepeatMode);
		const options = inner.options as Record<string, unknown>;
		expect(options.repeatMode).toBe(ProtoRepeatMode.Off);
	});

	it("maps RepeatState.Track to ProtoRepeatMode.One", () => {
		const msg = repeat(RepeatState.Track);
		const inner = msg.sendCommandMessage as Record<string, unknown>;
		const options = inner.options as Record<string, unknown>;
		expect(options.repeatMode).toBe(ProtoRepeatMode.One);
	});

	it("maps RepeatState.All to ProtoRepeatMode.All", () => {
		const msg = repeat(RepeatState.All);
		const inner = msg.sendCommandMessage as Record<string, unknown>;
		const options = inner.options as Record<string, unknown>;
		expect(options.repeatMode).toBe(ProtoRepeatMode.All);
	});
});

describe("shuffle", () => {
	it("maps ShuffleState.Off to ProtoShuffleMode.Off", () => {
		const msg = shuffle(ShuffleState.Off);
		const inner = msg.sendCommandMessage as Record<string, unknown>;
		expect(inner.command).toBe(Command.ChangeShuffleMode);
		const options = inner.options as Record<string, unknown>;
		expect(options.shuffleMode).toBe(ProtoShuffleMode.Off);
	});

	it("maps ShuffleState.Albums to ProtoShuffleMode.Albums", () => {
		const msg = shuffle(ShuffleState.Albums);
		const inner = msg.sendCommandMessage as Record<string, unknown>;
		const options = inner.options as Record<string, unknown>;
		expect(options.shuffleMode).toBe(ProtoShuffleMode.Albums);
	});

	it("maps ShuffleState.Songs to ProtoShuffleMode.Songs", () => {
		const msg = shuffle(ShuffleState.Songs);
		const inner = msg.sendCommandMessage as Record<string, unknown>;
		const options = inner.options as Record<string, unknown>;
		expect(options.shuffleMode).toBe(ProtoShuffleMode.Songs);
	});
});

describe("seekToPosition", () => {
	it("creates seek command with position", () => {
		const msg = seekToPosition(120);
		const inner = msg.sendCommandMessage as Record<string, unknown>;
		expect(inner.command).toBe(Command.SeekToPlaybackPosition);
		const options = inner.options as Record<string, unknown>;
		expect(options.playbackPosition).toBe(120);
	});
});

describe("output device messages", () => {
	it("addOutputDevices creates correct message", () => {
		const msg = addOutputDevices("dev1", "dev2");
		expect(msg.type).toBe(MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE);
		const inner = msg.modifyOutputContextRequestMessage as Record<
			string,
			unknown
		>;
		expect(inner.addingDevices).toEqual(["dev1", "dev2"]);
		expect(inner.type).toBe(1);
	});

	it("removeOutputDevices creates correct message", () => {
		const msg = removeOutputDevices("dev1");
		const inner = msg.modifyOutputContextRequestMessage as Record<
			string,
			unknown
		>;
		expect(inner.removingDevices).toEqual(["dev1"]);
	});

	it("setOutputDevices creates correct message", () => {
		const msg = setOutputDevices("dev1", "dev2", "dev3");
		const inner = msg.modifyOutputContextRequestMessage as Record<
			string,
			unknown
		>;
		expect(inner.settingDevices).toEqual(["dev1", "dev2", "dev3"]);
	});
});

describe("Command constants", () => {
	it("has expected command values", () => {
		expect(Command.Play).toBe(1);
		expect(Command.Pause).toBe(2);
		expect(Command.TogglePlayPause).toBe(3);
		expect(Command.Stop).toBe(4);
		expect(Command.NextTrack).toBe(5);
		expect(Command.PreviousTrack).toBe(6);
		expect(Command.SkipForward).toBe(18);
		expect(Command.SkipBackward).toBe(19);
		expect(Command.SeekToPlaybackPosition).toBe(45);
		expect(Command.ChangeRepeatMode).toBe(46);
		expect(Command.ChangeShuffleMode).toBe(47);
	});
});
