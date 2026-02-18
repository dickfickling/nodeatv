import { describe, expect, it } from "vitest";
import {
	DEVICE_INFO_MESSAGE,
	EXTENSION_LOOKUP,
	inner,
	loadProtos,
	type ProtocolMessageObj,
	SEND_COMMAND_MESSAGE,
	SET_STATE_MESSAGE,
	SET_VOLUME_MESSAGE,
	UNKNOWN_MESSAGE,
} from "../../../src/protocols/mrp/protobuf/index.js";

describe("protobuf constants", () => {
	it("has expected message type values", () => {
		expect(UNKNOWN_MESSAGE).toBe(0);
		expect(SEND_COMMAND_MESSAGE).toBe(1);
		expect(SET_STATE_MESSAGE).toBe(4);
		expect(DEVICE_INFO_MESSAGE).toBe(15);
		expect(SET_VOLUME_MESSAGE).toBe(51);
	});

	it("EXTENSION_LOOKUP maps message types to field names", () => {
		expect(EXTENSION_LOOKUP[SEND_COMMAND_MESSAGE]).toBe("sendCommandMessage");
		expect(EXTENSION_LOOKUP[DEVICE_INFO_MESSAGE]).toBe("deviceInfoMessage");
		expect(EXTENSION_LOOKUP[SET_STATE_MESSAGE]).toBe("setStateMessage");
		expect(EXTENSION_LOOKUP[SET_VOLUME_MESSAGE]).toBe("setVolumeMessage");
	});

	it("EXTENSION_LOOKUP does not have entry for UNKNOWN_MESSAGE", () => {
		expect(EXTENSION_LOOKUP[UNKNOWN_MESSAGE]).toBeUndefined();
	});
});

describe("loadProtos", () => {
	it("loads all proto files successfully", async () => {
		const root = await loadProtos();
		expect(root).toBeDefined();
	});

	it("can look up ProtocolMessage type", async () => {
		const root = await loadProtos();
		const ProtocolMessage = root.lookupType("ProtocolMessage");
		expect(ProtocolMessage).toBeDefined();
		expect(ProtocolMessage.name).toBe("ProtocolMessage");
	});

	it("can create and encode a ProtocolMessage", async () => {
		const root = await loadProtos();
		const ProtocolMessage = root.lookupType("ProtocolMessage");
		const msg = ProtocolMessage.create({ type: DEVICE_INFO_MESSAGE });
		const encoded = ProtocolMessage.encode(msg).finish();
		expect(encoded).toBeInstanceOf(Uint8Array);
		expect(encoded.length).toBeGreaterThan(0);
	});

	it("returns same root on repeated calls", async () => {
		const root1 = await loadProtos();
		const root2 = await loadProtos();
		expect(root1).toBe(root2);
	});
});

describe("inner", () => {
	it("extracts extension message by type", () => {
		const msg: ProtocolMessageObj = {
			type: SEND_COMMAND_MESSAGE,
			sendCommandMessage: { command: 1 },
		};
		const ext = inner(msg);
		expect(ext).toEqual({ command: 1 });
	});

	it("extracts deviceInfoMessage", () => {
		const msg: ProtocolMessageObj = {
			type: DEVICE_INFO_MESSAGE,
			deviceInfoMessage: {
				name: "TestDevice",
				uniqueIdentifier: "abc-123",
			},
		};
		const ext = inner(msg);
		expect(ext.name).toBe("TestDevice");
		expect(ext.uniqueIdentifier).toBe("abc-123");
	});

	it("throws for unknown message type", () => {
		const msg: ProtocolMessageObj = { type: UNKNOWN_MESSAGE };
		expect(() => inner(msg)).toThrow("unknown message type");
	});

	it("throws when extension field is missing", () => {
		const msg: ProtocolMessageObj = { type: SEND_COMMAND_MESSAGE };
		expect(() => inner(msg)).toThrow("extension field");
	});

	it("throws for undefined type", () => {
		const msg: ProtocolMessageObj = {};
		expect(() => inner(msg)).toThrow("unknown message type");
	});
});
