/**
 * Helper code for dealing with MRP protobuf messages.
 */

import { randomUUID } from "node:crypto";
import { writeTlv } from "../../auth/hapTlv8.js";
import { RepeatState, ShuffleState } from "../../const.js";
import * as protobuf from "./protobuf/index.js";

export type ProtobufMessage = protobuf.ProtocolMessageObj;

/**
 * Create a ProtocolMessage with the given type and optional error code.
 */
export function create(
	messageType: number,
	errorCode = 0,
	identifier?: string,
): ProtobufMessage {
	const message: ProtobufMessage = {
		type: messageType,
		errorCode,
		uniqueIdentifier: randomUUID().toUpperCase(),
	};
	if (identifier) {
		message.identifier = identifier;
	}
	return message;
}

/**
 * Create a DEVICE_INFO_MESSAGE.
 */
export function deviceInformation(
	name: string,
	identifier: string,
	osBuild = "18G82",
	update = false,
): ProtobufMessage {
	const msgType = update
		? protobuf.DEVICE_INFO_UPDATE_MESSAGE
		: protobuf.DEVICE_INFO_MESSAGE;
	const message = create(msgType);
	message.deviceInfoMessage = {
		allowsPairing: true,
		applicationBundleIdentifier: "com.apple.TVRemote",
		applicationBundleVersion: "344.28",
		lastSupportedMessageType: 108,
		localizedModelName: "iPhone",
		name,
		protocolVersion: 1,
		sharedQueueVersion: 2,
		supportsACL: true,
		supportsExtendedMotion: true,
		supportsSharedQueue: true,
		supportsSystemPairing: true,
		systemBuildVersion: osBuild,
		systemMediaApplication: "com.apple.TVMusic",
		uniqueIdentifier: identifier,
		deviceClass: 1, // iPhone
		logicalDeviceCount: 1,
	};
	return message;
}

/**
 * Create a WAKE_DEVICE_MESSAGE.
 */
export function wakeDevice(): ProtobufMessage {
	const message = create(protobuf.WAKE_DEVICE_MESSAGE);
	message.wakeDeviceMessage = {};
	return message;
}

/**
 * Create a SET_CONNECTION_STATE_MESSAGE (state=Connected).
 */
export function setConnectionState(): ProtobufMessage {
	const message = create(protobuf.SET_CONNECTION_STATE_MESSAGE);
	message.setConnectionStateMessage = {
		state: 2, // Connected
	};
	return message;
}

/**
 * Create a GET_KEYBOARD_SESSION_MESSAGE.
 */
export function getKeyboardSession(): ProtobufMessage {
	const message = create(protobuf.GET_KEYBOARD_SESSION_MESSAGE);
	message.getKeyboardSessionMessage = {};
	return message;
}

/**
 * Create a CRYPTO_PAIRING_MESSAGE with TLV data.
 */
export function cryptoPairing(
	pairingData: Map<number, Buffer>,
	isPairing = false,
): ProtobufMessage {
	const message = create(protobuf.CRYPTO_PAIRING_MESSAGE);
	message.cryptoPairingMessage = {
		status: 0,
		pairingData: writeTlv(pairingData),
		isRetrying: false,
		isUsingSystemPairing: false,
		state: isPairing ? 2 : 0,
	};
	return message;
}

/**
 * Create a CLIENT_UPDATES_CONFIG_MESSAGE.
 */
export function clientUpdatesConfig(
	artworkUpdates = true,
	nowPlayingUpdates = false,
	volumeUpdates = true,
	keyboardUpdates = true,
	outputDeviceUpdates = true,
): ProtobufMessage {
	const message = create(protobuf.CLIENT_UPDATES_CONFIG_MESSAGE);
	message.clientUpdatesConfigMessage = {
		artworkUpdates,
		nowPlayingUpdates,
		volumeUpdates,
		keyboardUpdates,
		outputDeviceUpdates,
	};
	return message;
}

/**
 * Create a PLAYBACK_QUEUE_REQUEST_MESSAGE.
 */
export function playbackQueueRequest(
	location: number,
	width = -1,
	height = 400,
): ProtobufMessage {
	const message = create(protobuf.PLAYBACK_QUEUE_REQUEST_MESSAGE);
	message.playbackQueueRequestMessage = {
		location,
		length: 1,
		artworkWidth: width,
		artworkHeight: height,
		returnContentItemAssetsInUserCompletion: true,
	};
	return message;
}

/**
 * Create a SEND_HID_EVENT_MESSAGE.
 */
export function sendHidEvent(
	usePage: number,
	usage: number,
	down: boolean,
): ProtobufMessage {
	const message = create(protobuf.SEND_HID_EVENT_MESSAGE);

	// Hardcoded mach AbsoluteTime (device doesn't care about accuracy)
	const abstime = Buffer.from("438922cf08020000", "hex");

	const data = Buffer.alloc(6);
	data.writeUInt16BE(usePage, 0);
	data.writeUInt16BE(usage, 2);
	data.writeUInt16BE(down ? 1 : 0, 4);

	// Format expected by the device
	const _hidEventData = Buffer.concat([
		abstime,
		Buffer.from(
			"00000000000000000100000000000000020000002000000003000000010000000000000",
			"hex",
		),
		// The hex above is 35 nibbles = not byte-aligned. Let's use the exact Python format:
	]);

	// Rewrite using the exact binary from pyatv
	const prefix = Buffer.from(
		"0000000000000000010000000000000002000000200000000300000001000000000000",
		"hex",
	);
	const suffix = Buffer.from("0000000000000001000000", "hex");
	const fullData = Buffer.concat([abstime, prefix, data, suffix]);

	message.sendHIDEventMessage = {
		hidEventData: fullData,
	};
	return message;
}

/**
 * Create a SEND_BUTTON_EVENT_MESSAGE.
 */
export function sendButton(
	usagePage: number,
	usage: number,
	buttonDown: boolean,
): ProtobufMessage {
	const message = create(protobuf.SEND_BUTTON_EVENT_MESSAGE);
	message.sendButtonEventMessage = {
		usagePage,
		usage,
		buttonDown,
	};
	return message;
}

/**
 * Create a SEND_COMMAND_MESSAGE (playback command).
 */
export function sendCommand(
	cmd: number,
	options?: Record<string, unknown>,
): ProtobufMessage {
	const message = create(protobuf.SEND_COMMAND_MESSAGE);
	message.sendCommandMessage = {
		command: cmd,
		options: options ?? {},
	};
	return message;
}

/**
 * Create a SEND_COMMAND_RESULT_MESSAGE.
 */
export function commandResult(
	identifier: string,
	sendError = 0,
): ProtobufMessage {
	const message = create(protobuf.SEND_COMMAND_RESULT_MESSAGE, 0, identifier);
	message.sendCommandResultMessage = {
		sendError,
		handlerReturnStatus: 0, // Success
	};
	return message;
}

// --- Command enum values from CommandInfo.proto ---
export const Command = {
	Unknown: 0,
	Play: 1,
	Pause: 2,
	TogglePlayPause: 3,
	Stop: 4,
	NextTrack: 5,
	PreviousTrack: 6,
	AdvanceShuffleMode: 7,
	AdvanceRepeatMode: 8,
	SkipForward: 18,
	SkipBackward: 19,
	SeekToPlaybackPosition: 45,
	ChangeRepeatMode: 46,
	ChangeShuffleMode: 47,
} as const;

// --- RepeatMode enum values from Common.proto ---
export const ProtoRepeatMode = {
	Unknown: 0,
	Off: 1,
	One: 2,
	All: 3,
} as const;

// --- ShuffleMode enum values from Common.proto ---
export const ProtoShuffleMode = {
	Unknown: 0,
	Off: 1,
	Albums: 2,
	Songs: 3,
} as const;

/**
 * Create a repeat mode change command.
 */
export function repeat(mode: RepeatState): ProtobufMessage {
	let repeatMode: number;
	if (mode === RepeatState.Off) {
		repeatMode = ProtoRepeatMode.Off;
	} else if (mode === RepeatState.Track) {
		repeatMode = ProtoRepeatMode.One;
	} else {
		repeatMode = ProtoRepeatMode.All;
	}

	const message = sendCommand(Command.ChangeRepeatMode, {
		sendOptions: 0,
		repeatMode,
	});
	return message;
}

/**
 * Create a shuffle mode change command.
 */
export function shuffle(state: ShuffleState): ProtobufMessage {
	let shuffleMode: number;
	if (state === ShuffleState.Off) {
		shuffleMode = ProtoShuffleMode.Off;
	} else if (state === ShuffleState.Albums) {
		shuffleMode = ProtoShuffleMode.Albums;
	} else {
		shuffleMode = ProtoShuffleMode.Songs;
	}

	const message = sendCommand(Command.ChangeShuffleMode, {
		sendOptions: 0,
		shuffleMode,
	});
	return message;
}

/**
 * Seek to an absolute position in stream.
 */
export function seekToPosition(position: number): ProtobufMessage {
	return sendCommand(Command.SeekToPlaybackPosition, {
		playbackPosition: position,
	});
}

/**
 * Create a SET_VOLUME_MESSAGE.
 */
export function setVolume(deviceUid: string, volume: number): ProtobufMessage {
	const message = create(protobuf.SET_VOLUME_MESSAGE);
	message.setVolumeMessage = {
		outputDeviceUID: deviceUid,
		volume,
	};
	return message;
}

/**
 * Create a MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE to add devices.
 */
export function addOutputDevices(...deviceUids: string[]): ProtobufMessage {
	const message = create(protobuf.MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE);
	message.modifyOutputContextRequestMessage = {
		type: 1, // SharedAudioPresentation
		addingDevices: deviceUids,
		clusterAwareAddingDevices: deviceUids,
	};
	return message;
}

/**
 * Create a MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE to remove devices.
 */
export function removeOutputDevices(...deviceUids: string[]): ProtobufMessage {
	const message = create(protobuf.MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE);
	message.modifyOutputContextRequestMessage = {
		type: 1, // SharedAudioPresentation
		removingDevices: deviceUids,
		clusterAwareRemovingDevices: deviceUids,
	};
	return message;
}

/**
 * Create a MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE to set devices.
 */
export function setOutputDevices(...deviceUids: string[]): ProtobufMessage {
	const message = create(protobuf.MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE);
	message.modifyOutputContextRequestMessage = {
		type: 1, // SharedAudioPresentation
		settingDevices: deviceUids,
		clusterAwareSettingDevices: deviceUids,
	};
	return message;
}
