/**
 * Base classes used by streaming protocols.
 */

import * as dgram from "node:dgram";
import type { AddressInfo } from "node:net";
import { FRAMES_PER_PACKET } from "../../../support/rtsp.js";
import { TimingPacket } from "../packets.js";
import * as timing from "../timing.js";

/**
 * Data used for one RAOP session.
 */
export class StreamContext {
	credentials: string | null = null;
	password: string | null = null;

	sampleRate = 44100;
	channels = 2;
	bytesPerChannel = 2;
	latency = 22050 + 44100;

	rtpseq = 0;
	startTs = 0;
	headTs = 0;
	paddingSent = 0;

	serverPort = 0;
	eventPort = 0;
	controlPort = 0;
	timingPort = 0;
	rtspSession = 0;

	volume: number | null = null;

	/** Reset session. Must be done when sample rate changes. */
	reset(): void {
		this.rtpseq = Math.floor(Math.random() * 2 ** 16);
		this.startTs = timing.ntp2ts(timing.ntpNow(), this.sampleRate);
		this.headTs = this.startTs;
		this.latency = 22050 + this.sampleRate;
		this.paddingSent = 0;
	}

	/** Current RTP time with latency. */
	get rtptime(): number {
		return this.headTs - (this.startTs - this.latency);
	}

	/** Current position in stream (seconds with fraction). */
	get position(): number {
		// Do not consider latency here (so do not use rtptime)
		return timing.ts2ms(this.headTs - this.startTs, this.sampleRate) / 1000.0;
	}

	/** Size of a single audio frame. */
	get frameSize(): number {
		return this.channels * this.bytesPerChannel;
	}

	/** Size of a full audio packet. */
	get packetSize(): number {
		return FRAMES_PER_PACKET * this.frameSize;
	}
}

/**
 * Base interface for a streaming protocol.
 */
export interface StreamProtocol {
	setup(timingServerPort: number, controlClientPort: number): Promise<void>;
	teardown(): void;
	startFeedback(): Promise<void>;
	sendAudioPacket(
		transport: dgram.Socket,
		rtpHeader: Buffer,
		audio: Buffer,
	): Promise<[number, Buffer]>;
	playUrl(
		timingServerPort: number,
		url: string,
		position?: number,
	): Promise<unknown>;
}

/**
 * Basic timing server responding to timing requests.
 */
export class TimingServer {
	private socket: dgram.Socket | null = null;

	get port(): number {
		const addr = this.socket?.address();
		return addr ? (addr as AddressInfo).port : 0;
	}

	async start(localAddress: string, port = 0): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket = dgram.createSocket("udp4");
			this.socket.on("error", (err) => {
				reject(err);
			});
			this.socket.on("message", (data, rinfo) => {
				this.datagramReceived(data, rinfo);
			});
			this.socket.bind(port, localAddress, () => {
				resolve();
			});
		});
	}

	close(): void {
		if (this.socket) {
			this.socket.close();
			this.socket = null;
		}
	}

	private datagramReceived(data: Buffer, rinfo: dgram.RemoteInfo): void {
		const req = TimingPacket.decode(data, true);
		const [recvtimeSec, recvtimeFrac] = timing.ntp2parts(timing.ntpNow());
		const resp = TimingPacket.encode(
			req.proto as number,
			0x53 | 0x80,
			7,
			0,
			req.sendtime_sec as number,
			req.sendtime_frac as number,
			recvtimeSec,
			recvtimeFrac,
			recvtimeSec,
			recvtimeFrac,
		);
		this.socket?.send(resp, rinfo.port, rinfo.address);
	}
}
