import { describe, expect, it } from "vitest";
import {
	AudioPacketHeader,
	RetransmitRequest,
	RtpHeader,
	SyncPacket,
	TimingPacket,
} from "../../../src/protocols/raop/packets.js";

describe("RtpHeader", () => {
	it("should encode and decode correctly", () => {
		const encoded = RtpHeader.encode(0x80, 0x60, 0x0001);
		expect(encoded.length).toBe(RtpHeader.length);

		const decoded = RtpHeader.decode(encoded);
		expect(decoded.proto).toBe(0x80);
		expect(decoded.type).toBe(0x60);
		expect(decoded.seqno).toBe(0x0001);
	});

	it("should have correct length", () => {
		expect(RtpHeader.length).toBe(4);
	});
});

describe("TimingPacket", () => {
	it("should encode and decode correctly", () => {
		const encoded = TimingPacket.encode(
			0x80,
			0xd3,
			7,
			0,
			100,
			200,
			300,
			400,
			500,
			600,
		);
		expect(encoded.length).toBe(TimingPacket.length);

		const decoded = TimingPacket.decode(encoded);
		expect(decoded.proto).toBe(0x80);
		expect(decoded.type).toBe(0xd3);
		expect(decoded.seqno).toBe(7);
		expect(decoded.padding).toBe(0);
		expect(decoded.reftime_sec).toBe(100);
		expect(decoded.reftime_frac).toBe(200);
		expect(decoded.recvtime_sec).toBe(300);
		expect(decoded.recvtime_frac).toBe(400);
		expect(decoded.sendtime_sec).toBe(500);
		expect(decoded.sendtime_frac).toBe(600);
	});

	it("should have correct length for timing packet", () => {
		// 4 (RtpHeader) + 7*4 = 32 bytes
		expect(TimingPacket.length).toBe(32);
	});
});

describe("SyncPacket", () => {
	it("should encode and decode correctly", () => {
		const encoded = SyncPacket.encode(
			0x90,
			0xd4,
			0x0007,
			1000,
			2000,
			3000,
			4000,
		);
		expect(encoded.length).toBe(SyncPacket.length);

		const decoded = SyncPacket.decode(encoded);
		expect(decoded.proto).toBe(0x90);
		expect(decoded.type).toBe(0xd4);
		expect(decoded.seqno).toBe(0x0007);
		expect(decoded.now_without_latency).toBe(1000);
		expect(decoded.last_sync_sec).toBe(2000);
		expect(decoded.last_sync_frac).toBe(3000);
		expect(decoded.now).toBe(4000);
	});

	it("should have correct length", () => {
		// 4 (RtpHeader) + 4*4 = 20 bytes
		expect(SyncPacket.length).toBe(20);
	});
});

describe("AudioPacketHeader", () => {
	it("should encode and decode correctly", () => {
		const encoded = AudioPacketHeader.encode(0x80, 0xe0, 42, 12345, 67890);
		expect(encoded.length).toBe(AudioPacketHeader.length);

		const decoded = AudioPacketHeader.decode(encoded);
		expect(decoded.proto).toBe(0x80);
		expect(decoded.type).toBe(0xe0);
		expect(decoded.seqno).toBe(42);
		expect(decoded.timestamp).toBe(12345);
		expect(decoded.ssrc).toBe(67890);
	});

	it("should have correct length", () => {
		// 4 (RtpHeader) + 2*4 = 12 bytes
		expect(AudioPacketHeader.length).toBe(12);
	});
});

describe("RetransmitRequest", () => {
	it("should encode and decode correctly", () => {
		const encoded = RetransmitRequest.encode(0x80, 0xd5, 0x0001, 100, 5);
		expect(encoded.length).toBe(RetransmitRequest.length);

		const decoded = RetransmitRequest.decode(encoded);
		expect(decoded.proto).toBe(0x80);
		expect(decoded.type).toBe(0xd5);
		expect(decoded.seqno).toBe(0x0001);
		expect(decoded.lost_seqno).toBe(100);
		expect(decoded.lost_packets).toBe(5);
	});

	it("should have correct length", () => {
		// 4 (RtpHeader) + 2*2 = 8 bytes
		expect(RetransmitRequest.length).toBe(8);
	});
});
