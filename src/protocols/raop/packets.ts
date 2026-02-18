/**
 * Packet formats used by RAOP.
 */

import { defpacket, type PacketType } from "../../support/packet.js";

export const RtpHeader: PacketType = defpacket("RtpHeader", {
	proto: "B",
	type: "B",
	seqno: "H",
});

export const TimingPacket: PacketType = RtpHeader.extend("TimingPacket", {
	padding: "I",
	reftime_sec: "I",
	reftime_frac: "I",
	recvtime_sec: "I",
	recvtime_frac: "I",
	sendtime_sec: "I",
	sendtime_frac: "I",
});

export const SyncPacket: PacketType = RtpHeader.extend("SyncPacket", {
	now_without_latency: "I",
	last_sync_sec: "I",
	last_sync_frac: "I",
	now: "I",
});

// NB: Audio payload is not included here, shall be appended manually
export const AudioPacketHeader: PacketType = RtpHeader.extend(
	"AudioPacketHeader",
	{
		timestamp: "I",
		ssrc: "I",
	},
);

export const RetransmitRequest: PacketType = RtpHeader.extend(
	"RetransmitPacket",
	{
		lost_seqno: "H",
		lost_packets: "H",
	},
);
