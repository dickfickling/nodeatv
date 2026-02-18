import { createDecipheriv } from "node:crypto";
import { type MockInstance, describe, expect, it, vi } from "vitest";
import { AuthenticationType } from "../../../src/auth/hapPairing.js";
import type { HttpResponse } from "../../../src/support/http.js";

// Mock verifyConnection before importing modules that use it
vi.mock("../../../src/protocols/airplay/auth/index.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../src/protocols/airplay/auth/index.js")>();
	return {
		...actual,
		verifyConnection: vi.fn().mockResolvedValue({
			verifyCredentials: vi.fn(),
			encryptionKeys: vi.fn(),
		}),
	};
});

// Mock decodeBplistFromBody for V2 tests
vi.mock("../../../src/support/http.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../src/support/http.js")>();
	return {
		...actual,
		decodeBplistFromBody: vi.fn().mockReturnValue({
			streams: [{ controlPort: 5555, dataPort: 6666 }],
		}),
	};
});

import { verifyConnection } from "../../../src/protocols/airplay/auth/index.js";
import { AirPlayV1 } from "../../../src/protocols/raop/protocols/airplayv1.js";
import { AirPlayV2 } from "../../../src/protocols/raop/protocols/airplayv2.js";
import { StreamContext } from "../../../src/protocols/raop/protocols/index.js";
import type { RtspSession } from "../../../src/support/rtsp.js";

function createMockRtsp(): RtspSession {
	return {
		connection: {} as never,
		sessionId: 12345,
		announce: vi.fn().mockResolvedValue(undefined),
		setup: vi.fn().mockResolvedValue({
			code: 200,
			headers: {
				Transport: "RTP/AVP/UDP;unicast;server_port=6000;control_port=6001;timing_port=6002",
				Session: "1",
			},
			body: Buffer.alloc(0),
		} satisfies Partial<HttpResponse>),
		record: vi.fn().mockResolvedValue({ code: 200 }),
		feedback: vi.fn().mockResolvedValue({ code: 200 }),
	} as unknown as RtspSession;
}

describe("AirPlayV1 pair_verify", () => {
	it("calls verifyConnection when credentials are present", async () => {
		const ctx = new StreamContext();
		// HAP credentials format: ltpk:ltsk:atvId:clientId
		ctx.credentials = "aa:bb:cc:dd";
		const rtsp = createMockRtsp();
		const v1 = new AirPlayV1(ctx, rtsp);

		await v1.setup(1000, 2000);

		expect(verifyConnection).toHaveBeenCalledWith(
			expect.objectContaining({ type: AuthenticationType.HAP }),
			rtsp.connection,
		);
	});

	it("skips verifyConnection when credentials are null", async () => {
		const ctx = new StreamContext();
		ctx.credentials = null;
		const rtsp = createMockRtsp();
		const v1 = new AirPlayV1(ctx, rtsp);

		(verifyConnection as MockInstance).mockClear();
		await v1.setup(1000, 2000);

		expect(verifyConnection).not.toHaveBeenCalled();
	});
});

describe("AirPlayV2 pair_verify", () => {
	it("calls verifyConnection when credentials are present", async () => {
		const ctx = new StreamContext();
		ctx.credentials = "aa:bb:cc:dd";
		const rtsp = createMockRtsp();
		const v2 = new AirPlayV2(ctx, rtsp);

		(verifyConnection as MockInstance).mockClear();
		await v2.setup(1000, 2000);

		expect(verifyConnection).toHaveBeenCalledWith(
			expect.objectContaining({ type: AuthenticationType.HAP }),
			rtsp.connection,
		);
	});

	it("generates random audio key (not zeros)", async () => {
		const ctx = new StreamContext();
		ctx.credentials = null;
		const rtsp = createMockRtsp();
		const v2 = new AirPlayV2(ctx, rtsp);

		await v2.setup(1000, 2000);

		// Access _audioKey via type assertion
		const audioKey = (v2 as unknown as { _audioKey: Buffer })._audioKey;
		expect(audioKey.length).toBe(32);
		// Very unlikely to be all zeros with randomBytes
		expect(audioKey.equals(Buffer.alloc(32, 0))).toBe(false);
	});

	it("parses bplist SETUP response for stream ports", async () => {
		const ctx = new StreamContext();
		ctx.credentials = null;
		const rtsp = createMockRtsp();
		const v2 = new AirPlayV2(ctx, rtsp);

		await v2.setup(1000, 2000);

		expect(ctx.controlPort).toBe(5555);
		expect(ctx.serverPort).toBe(6666);
	});
});

describe("AirPlayV2 sendAudioPacket", () => {
	it("produces encrypted output with 16-byte auth tag", async () => {
		const ctx = new StreamContext();
		ctx.credentials = null;
		ctx.rtpseq = 1;
		const rtsp = createMockRtsp();
		const v2 = new AirPlayV2(ctx, rtsp);

		await v2.setup(1000, 2000);

		const rtpHeader = Buffer.alloc(12, 0xab);
		const audio = Buffer.alloc(352 * 4, 0x42); // some audio data

		const mockSocket = { send: vi.fn() } as unknown as import("node:dgram").Socket;
		const [seq, packet] = await v2.sendAudioPacket(mockSocket, rtpHeader, audio);

		expect(seq).toBe(1);
		// Packet = rtpHeader (12) + encrypted audio (same size as input) + auth tag (16)
		expect(packet.length).toBe(12 + audio.length + 16);
		expect(mockSocket.send).toHaveBeenCalledWith(packet);

		// Verify encryption actually happened (ciphertext != plaintext)
		const encryptedAudio = packet.subarray(12, 12 + audio.length);
		expect(encryptedAudio.equals(audio)).toBe(false);

		// Verify we can decrypt with the same key
		const audioKey = (v2 as unknown as { _audioKey: Buffer })._audioKey;
		const nonce = Buffer.alloc(12);
		nonce.writeUIntLE(1, 0, 6);
		const decipher = createDecipheriv("chacha20-poly1305", audioKey, nonce, {
			authTagLength: 16,
		});
		decipher.setAAD(rtpHeader.subarray(0, 4));
		decipher.setAuthTag(packet.subarray(12 + audio.length));
		const decrypted = decipher.update(encryptedAudio);
		decipher.final();
		expect(decrypted.equals(audio)).toBe(true);
	});
});
