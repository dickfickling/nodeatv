import { describe, expect, it } from "vitest";
import { FrameType } from "../../../src/protocols/companion/connection.js";

describe("FrameType", () => {
	it("has expected enum values", () => {
		expect(FrameType.Unknown).toBe(0);
		expect(FrameType.NoOp).toBe(1);
		expect(FrameType.PS_Start).toBe(3);
		expect(FrameType.PS_Next).toBe(4);
		expect(FrameType.PV_Start).toBe(5);
		expect(FrameType.PV_Next).toBe(6);
		expect(FrameType.U_OPACK).toBe(7);
		expect(FrameType.E_OPACK).toBe(8);
		expect(FrameType.P_OPACK).toBe(9);
		expect(FrameType.PA_Req).toBe(10);
		expect(FrameType.PA_Rsp).toBe(11);
		expect(FrameType.SessionStartRequest).toBe(16);
		expect(FrameType.SessionStartResponse).toBe(17);
		expect(FrameType.SessionData).toBe(18);
		expect(FrameType.FamilyIdentityRequest).toBe(32);
		expect(FrameType.FamilyIdentityResponse).toBe(33);
		expect(FrameType.FamilyIdentityUpdate).toBe(34);
	});
});

describe("companion frame encoding", () => {
	it("header is 1 byte type + 3 byte big-endian length", () => {
		// Simulate building a frame header manually
		const frameType = FrameType.E_OPACK;
		const payloadLength = 256;

		const header = Buffer.alloc(4);
		header[0] = frameType;
		header[1] = (payloadLength >> 16) & 0xff;
		header[2] = (payloadLength >> 8) & 0xff;
		header[3] = payloadLength & 0xff;

		expect(header[0]).toBe(8); // E_OPACK
		expect(header[1]).toBe(0);
		expect(header[2]).toBe(1);
		expect(header[3]).toBe(0);
	});

	it("decodes header correctly", () => {
		const header = Buffer.from([0x07, 0x00, 0x00, 0x0a]);
		const frameType = header[0];
		const payloadLength = (header[1] << 16) | (header[2] << 8) | header[3];

		expect(frameType).toBe(FrameType.U_OPACK);
		expect(payloadLength).toBe(10);
	});

	it("handles large payload lengths (3 bytes)", () => {
		const payloadLength = 0x0fffff;
		const header = Buffer.alloc(4);
		header[0] = FrameType.E_OPACK;
		header[1] = (payloadLength >> 16) & 0xff;
		header[2] = (payloadLength >> 8) & 0xff;
		header[3] = payloadLength & 0xff;

		const decoded = (header[1] << 16) | (header[2] << 8) | header[3];
		expect(decoded).toBe(payloadLength);
	});

	it("handles zero-length payload", () => {
		const header = Buffer.from([FrameType.NoOp, 0x00, 0x00, 0x00]);
		const payloadLength = (header[1] << 16) | (header[2] << 8) | header[3];
		expect(payloadLength).toBe(0);
	});
});
