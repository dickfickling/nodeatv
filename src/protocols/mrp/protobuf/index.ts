/**
 * Protobuf loading and extension handling for MRP protocol messages.
 *
 * Loads all .proto files at runtime using protobufjs and provides
 * message type constants and extension lookup.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import protobuf from "protobufjs";

let _root: protobuf.Root | null = null;

/**
 * Load all .proto files and return the protobufjs Root.
 * The proto files use import paths like "pyatv/protocols/mrp/protobuf/Foo.proto",
 * so we configure a path resolver that maps those to the local directory.
 */
export async function loadProtos(): Promise<protobuf.Root> {
	if (_root) return _root;

	const protoDir = path.dirname(fileURLToPath(import.meta.url));

	// The proto files import from "pyatv/protocols/mrp/protobuf/X.proto"
	// We need to resolve that prefix to the local proto directory.
	const root = new protobuf.Root();
	root.resolvePath = (_origin: string, target: string): string => {
		// Strip the pyatv prefix and resolve relative to protoDir
		const stripped = target.replace(/^pyatv\/protocols\/mrp\/protobuf\//, "");
		return path.resolve(protoDir, stripped);
	};

	// Load ProtocolMessage first (it defines the base message and extensions range)
	await root.load(path.resolve(protoDir, "ProtocolMessage.proto"));

	// Load all message files that extend ProtocolMessage
	const extensionFiles = [
		"AudioFadeMessage.proto",
		"AudioFadeResponseMessage.proto",
		"ClientUpdatesConfigMessage.proto",
		"ConfigureConnectionMessage.proto",
		"CryptoPairingMessage.proto",
		"DeviceInfoMessage.proto",
		"GenericMessage.proto",
		"GetKeyboardSessionMessage.proto",
		"GetRemoteTextInputSessionMessage.proto",
		"GetVolumeMessage.proto",
		"GetVolumeResultMessage.proto",
		"KeyboardMessage.proto",
		"ModifyOutputContextRequestMessage.proto",
		"NotificationMessage.proto",
		"OriginClientPropertiesMessage.proto",
		"PlaybackQueueRequestMessage.proto",
		"PlayerClientPropertiesMessage.proto",
		"RegisterForGameControllerEventsMessage.proto",
		"RegisterHIDDeviceMessage.proto",
		"RegisterHIDDeviceResultMessage.proto",
		"RegisterVoiceInputDeviceMessage.proto",
		"RegisterVoiceInputDeviceResponseMessage.proto",
		"RemoteTextInputMessage.proto",
		"RemoveClientMessage.proto",
		"RemoveEndpointsMessage.proto",
		"RemoveOutputDevicesMessage.proto",
		"RemovePlayerMessage.proto",
		"SendButtonEventMessage.proto",
		"SendCommandMessage.proto",
		"SendCommandResultMessage.proto",
		"SendHIDEventMessage.proto",
		"SendPackedVirtualTouchEventMessage.proto",
		"SendVoiceInputMessage.proto",
		"SetArtworkMessage.proto",
		"SetConnectionStateMessage.proto",
		"SetDefaultSupportedCommandsMessage.proto",
		"SetDiscoveryModeMessage.proto",
		"SetHiliteModeMessage.proto",
		"SetNowPlayingClientMessage.proto",
		"SetNowPlayingPlayerMessage.proto",
		"SetRecordingStateMessage.proto",
		"SetStateMessage.proto",
		"SetVolumeMessage.proto",
		"TextInputMessage.proto",
		"TransactionMessage.proto",
		"UpdateClientMessage.proto",
		"UpdateContentItemArtworkMessage.proto",
		"UpdateContentItemMessage.proto",
		"UpdateEndPointsMessage.proto",
		"UpdateOutputDeviceMessage.proto",
		"UpdatePlayerPath.proto",
		"VolumeControlAvailabilityMessage.proto",
		"VolumeControlCapabilitiesDidChangeMessage.proto",
		"VolumeDidChangeMessage.proto",
		"WakeDeviceMessage.proto",
	];

	for (const file of extensionFiles) {
		await root.load(path.resolve(protoDir, file));
	}

	root.resolveAll();
	_root = root;
	return root;
}

/**
 * Get the loaded protobufjs Root. Must call loadProtos() first.
 */
export function getRoot(): protobuf.Root {
	if (!_root) {
		throw new Error("Protos not loaded. Call loadProtos() first.");
	}
	return _root;
}

// --- ProtocolMessage.Type enum constants ---

export const UNKNOWN_MESSAGE = 0;
export const SEND_COMMAND_MESSAGE = 1;
export const SEND_COMMAND_RESULT_MESSAGE = 2;
export const GET_STATE_MESSAGE = 3;
export const SET_STATE_MESSAGE = 4;
export const SET_ARTWORK_MESSAGE = 5;
export const REGISTER_HID_DEVICE_MESSAGE = 6;
export const REGISTER_HID_DEVICE_RESULT_MESSAGE = 7;
export const SEND_HID_EVENT_MESSAGE = 8;
export const SEND_HID_REPORT_MESSAGE = 9;
export const SEND_VIRTUAL_TOUCH_EVENT_MESSAGE = 10;
export const NOTIFICATION_MESSAGE = 11;
export const CONTENT_ITEMS_CHANGED_NOTIFICATION_MESSAGE = 12;
export const DEVICE_INFO_MESSAGE = 15;
export const CLIENT_UPDATES_CONFIG_MESSAGE = 16;
export const VOLUME_CONTROL_AVAILABILITY_MESSAGE = 17;
export const GAME_CONTROLLER_MESSAGE = 18;
export const REGISTER_GAME_CONTROLLER_MESSAGE = 19;
export const REGISTER_GAME_CONTROLLER_RESPONSE_MESSAGE = 20;
export const UNREGISTER_GAME_CONTROLLER_MESSAGE = 21;
export const REGISTER_FOR_GAME_CONTROLLER_EVENTS_MESSAGE = 22;
export const KEYBOARD_MESSAGE = 23;
export const GET_KEYBOARD_SESSION_MESSAGE = 24;
export const TEXT_INPUT_MESSAGE = 25;
export const GET_VOICE_INPUT_DEVICES_MESSAGE = 26;
export const GET_VOICE_INPUT_DEVICES_RESPONSE_MESSAGE = 27;
export const REGISTER_VOICE_INPUT_DEVICE_MESSAGE = 28;
export const REGISTER_VOICE_INPUT_DEVICE_RESPONSE_MESSAGE = 29;
export const SET_RECORDING_STATE_MESSAGE = 30;
export const SEND_VOICE_INPUT_MESSAGE = 31;
export const PLAYBACK_QUEUE_REQUEST_MESSAGE = 32;
export const TRANSACTION_MESSAGE = 33;
export const CRYPTO_PAIRING_MESSAGE = 34;
export const GAME_CONTROLLER_PROPERTIES_MESSAGE = 35;
export const SET_READY_STATE_MESSAGE = 36;
export const DEVICE_INFO_UPDATE_MESSAGE = 37;
export const SET_CONNECTION_STATE_MESSAGE = 38;
export const SEND_BUTTON_EVENT_MESSAGE = 39;
export const SET_HILITE_MODE_MESSAGE = 40;
export const WAKE_DEVICE_MESSAGE = 41;
export const GENERIC_MESSAGE = 42;
export const SEND_PACKED_VIRTUAL_TOUCH_EVENT_MESSAGE = 43;
export const SEND_LYRICS_EVENT = 44;
export const SET_NOW_PLAYING_CLIENT_MESSAGE = 46;
export const SET_NOW_PLAYING_PLAYER_MESSAGE = 47;
export const MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE = 48;
export const GET_VOLUME_MESSAGE = 49;
export const GET_VOLUME_RESULT_MESSAGE = 50;
export const SET_VOLUME_MESSAGE = 51;
export const VOLUME_DID_CHANGE_MESSAGE = 52;
export const REMOVE_CLIENT_MESSAGE = 53;
export const REMOVE_PLAYER_MESSAGE = 54;
export const UPDATE_CLIENT_MESSAGE = 55;
export const UPDATE_CONTENT_ITEM_MESSAGE = 56;
export const UPDATE_CONTENT_ITEM_ARTWORK_MESSAGE = 57;
export const UPDATE_PLAYER_MESSAGE = 58;
export const SET_DEFAULT_SUPPORTED_COMMANDS_MESSAGE = 72;
export const SET_DISCOVERY_MODE_MESSAGE = 101;
export const UPDATE_END_POINTS_MESSAGE = 102;
export const REMOVE_ENDPOINTS_MESSAGE = 103;
export const PLAYER_CLIENT_PROPERTIES_MESSAGE = 104;
export const ORIGIN_CLIENT_PROPERTIES_MESSAGE = 105;
export const AUDIO_FADE_MESSAGE = 106;
export const AUDIO_FADE_RESPONSE_MESSAGE = 107;
export const CONFIGURE_CONNECTION_MESSAGE = 120;
export const VOLUME_CONTROL_CAPABILITIES_DID_CHANGE_MESSAGE = 64;
export const REMOVE_OUTPUT_DEVICES_MESSAGE = 66;
export const REMOTE_TEXT_INPUT_MESSAGE = 67;
export const GET_REMOTE_TEXT_INPUT_SESSION_MESSAGE = 68;
export const UPDATE_OUTPUT_DEVICE_MESSAGE = 65;

// --- Extension field name lookup ---
// Maps message type number -> camelCase extension field name on ProtocolMessage

export const EXTENSION_LOOKUP: Record<number, string> = {
	[AUDIO_FADE_MESSAGE]: "audioFadeMessage",
	[AUDIO_FADE_RESPONSE_MESSAGE]: "audioFadeResponseMessage",
	[CLIENT_UPDATES_CONFIG_MESSAGE]: "clientUpdatesConfigMessage",
	[CONFIGURE_CONNECTION_MESSAGE]: "configureConnectionMessage",
	[CRYPTO_PAIRING_MESSAGE]: "cryptoPairingMessage",
	[DEVICE_INFO_MESSAGE]: "deviceInfoMessage",
	[DEVICE_INFO_UPDATE_MESSAGE]: "deviceInfoMessage",
	[GENERIC_MESSAGE]: "genericMessage",
	[GET_KEYBOARD_SESSION_MESSAGE]: "getKeyboardSessionMessage",
	[GET_REMOTE_TEXT_INPUT_SESSION_MESSAGE]: "getRemoteTextInputSessionMessage",
	[GET_VOLUME_MESSAGE]: "getVolumeMessage",
	[GET_VOLUME_RESULT_MESSAGE]: "getVolumeResultMessage",
	[KEYBOARD_MESSAGE]: "keyboardMessage",
	[MODIFY_OUTPUT_CONTEXT_REQUEST_MESSAGE]: "modifyOutputContextRequestMessage",
	[NOTIFICATION_MESSAGE]: "notificationMessage",
	[ORIGIN_CLIENT_PROPERTIES_MESSAGE]: "originClientPropertiesMessage",
	[PLAYBACK_QUEUE_REQUEST_MESSAGE]: "playbackQueueRequestMessage",
	[PLAYER_CLIENT_PROPERTIES_MESSAGE]: "playerClientPropertiesMessage",
	[REGISTER_FOR_GAME_CONTROLLER_EVENTS_MESSAGE]:
		"registerForGameControllerEventsMessage",
	[REGISTER_HID_DEVICE_MESSAGE]: "registerHIDDeviceMessage",
	[REGISTER_HID_DEVICE_RESULT_MESSAGE]: "registerHIDDeviceResultMessage",
	[REGISTER_VOICE_INPUT_DEVICE_MESSAGE]: "registerVoiceInputDeviceMessage",
	[REGISTER_VOICE_INPUT_DEVICE_RESPONSE_MESSAGE]:
		"registerVoiceInputDeviceResponseMessage",
	[REMOTE_TEXT_INPUT_MESSAGE]: "remoteTextInputMessage",
	[REMOVE_CLIENT_MESSAGE]: "removeClientMessage",
	[REMOVE_ENDPOINTS_MESSAGE]: "removeEndpointsMessage",
	[REMOVE_OUTPUT_DEVICES_MESSAGE]: "removeOutputDevicesMessage",
	[REMOVE_PLAYER_MESSAGE]: "removePlayerMessage",
	[SEND_BUTTON_EVENT_MESSAGE]: "sendButtonEventMessage",
	[SEND_COMMAND_MESSAGE]: "sendCommandMessage",
	[SEND_COMMAND_RESULT_MESSAGE]: "sendCommandResultMessage",
	[SEND_HID_EVENT_MESSAGE]: "sendHIDEventMessage",
	[SEND_PACKED_VIRTUAL_TOUCH_EVENT_MESSAGE]:
		"sendPackedVirtualTouchEventMessage",
	[SEND_VOICE_INPUT_MESSAGE]: "sendVoiceInputMessage",
	[SET_ARTWORK_MESSAGE]: "setArtworkMessage",
	[SET_CONNECTION_STATE_MESSAGE]: "setConnectionStateMessage",
	[SET_DEFAULT_SUPPORTED_COMMANDS_MESSAGE]:
		"setDefaultSupportedCommandsMessage",
	[SET_DISCOVERY_MODE_MESSAGE]: "setDiscoveryModeMessage",
	[SET_HILITE_MODE_MESSAGE]: "setHiliteModeMessage",
	[SET_NOW_PLAYING_CLIENT_MESSAGE]: "setNowPlayingClientMessage",
	[SET_NOW_PLAYING_PLAYER_MESSAGE]: "setNowPlayingPlayerMessage",
	[SET_RECORDING_STATE_MESSAGE]: "setRecordingStateMessage",
	[SET_STATE_MESSAGE]: "setStateMessage",
	[SET_VOLUME_MESSAGE]: "setVolumeMessage",
	[TEXT_INPUT_MESSAGE]: "textInputMessage",
	[TRANSACTION_MESSAGE]: "transactionMessage",
	[UPDATE_CLIENT_MESSAGE]: "updateClientMessage",
	[UPDATE_CONTENT_ITEM_ARTWORK_MESSAGE]: "updateContentItemArtworkMessage",
	[UPDATE_CONTENT_ITEM_MESSAGE]: "updateContentItemMessage",
	[UPDATE_END_POINTS_MESSAGE]: "updateEndPointsMessage",
	[UPDATE_OUTPUT_DEVICE_MESSAGE]: "updateOutputDeviceMessage",
	[VOLUME_CONTROL_AVAILABILITY_MESSAGE]: "volumeControlAvailabilityMessage",
	[VOLUME_CONTROL_CAPABILITIES_DID_CHANGE_MESSAGE]:
		"volumeControlCapabilitiesDidChangeMessage",
	[VOLUME_DID_CHANGE_MESSAGE]: "volumeDidChangeMessage",
	[WAKE_DEVICE_MESSAGE]: "wakeDeviceMessage",
};

// --- Protobuf message type alias ---
// A decoded ProtocolMessage from protobufjs (plain object form)
export type ProtocolMessageObj = Record<string, unknown> & {
	type?: number;
	identifier?: string;
	uniqueIdentifier?: string;
	errorCode?: number;
	errorDescription?: string;
	timestamp?: number;
};

/**
 * Return the inner extension message for a decoded ProtocolMessage.
 * The extension field name is determined by the message type.
 */
export function inner(msg: ProtocolMessageObj): Record<string, unknown> {
	const fieldName = EXTENSION_LOOKUP[msg.type ?? 0];
	if (!fieldName) {
		throw new Error(`unknown message type: ${msg.type}`);
	}
	const ext = msg[fieldName];
	if (!ext || typeof ext !== "object") {
		throw new Error(
			`extension field "${fieldName}" not found on message type ${msg.type}`,
		);
	}
	return ext as Record<string, unknown>;
}
