/**
 * Client for AirPlay audio streaming.
 *
 * This is a "generic" client designed around how AirPlay works in regards to streaming.
 * The client uses an underlying "protocol" for protocol specific bits, i.e. to support
 * AirPlay v1 and/or v2.
 */

import * as dgram from "node:dgram";
import type { AddressInfo } from "node:net";
import type { MediaMetadata } from "../../interface.js";
import type { Settings } from "../../settings.js";
import { FRAMES_PER_PACKET, type RtspSession } from "../../support/rtsp.js";
import type { AudioSource } from "./audioSource.js";
import { PacketFifo } from "./fifo.js";
import { AudioPacketHeader, RetransmitRequest, SyncPacket } from "./packets.js";
import {
	EncryptionType,
	getAudioProperties,
	getEncryptionTypes,
	getMetadataTypes,
	MetadataType,
} from "./parsers.js";
import {
	type StreamContext,
	type StreamProtocol,
	TimingServer,
} from "./protocols/index.js";
import * as timing from "./timing.js";

/** When being late, compensate by sending at most these many packets to catch up. */
const MAX_PACKETS_COMPENSATE = 3;

/** We should store this many packets in case retransmission is requested. */
const PACKET_BACKLOG_SIZE = 1000;

/** Number of "too slow to keep up" warnings to suppress before warning about them. */
const SLOW_WARNING_THRESHOLD = 5;

/** Metadata used when no metadata is present. */
const MISSING_METADATA: MediaMetadata = {
	title: "Streaming with nodeatv",
	artist: "nodeatv",
	album: "AirPlay",
	duration: 0.0,
};

const EMPTY_METADATA: MediaMetadata = {};

const SUPPORTED_ENCRYPTIONS =
	EncryptionType.Unencrypted | EncryptionType.MFiSAP;

/**
 * Information for what is currently playing.
 */
export interface PlaybackInfo {
	metadata: MediaMetadata;
	position: number;
}

/**
 * Listener interface for RAOP state changes.
 */
export interface RaopListener {
	playing(playbackInfo: PlaybackInfo): void;
	stopped(): void;
}

/**
 * Maintains statistics of frames during a streaming session.
 */
class Statistics {
	sampleRate: number;
	startTimeMs: number;
	intervalTime: number;
	totalFrames = 0;
	intervalFrames = 0;

	constructor(sampleRate: number) {
		this.sampleRate = sampleRate;
		this.startTimeMs = performance.now();
		this.intervalTime = performance.now();
	}

	get expectedFrameCount(): number {
		return Math.floor(
			((performance.now() - this.startTimeMs) / 1000) * this.sampleRate,
		);
	}

	get framesBehind(): number {
		return this.expectedFrameCount - this.totalFrames;
	}

	get intervalCompleted(): boolean {
		return this.intervalFrames >= this.sampleRate;
	}

	tick(sentFrames: number): void {
		this.totalFrames += sentFrames;
		this.intervalFrames += sentFrames;
	}

	newInterval(): [number, number] {
		const endTime = performance.now();
		const diff = (endTime - this.intervalTime) / 1000;
		this.intervalTime = endTime;
		const frames = this.intervalFrames;
		this.intervalFrames = 0;
		return [diff, frames];
	}
}

/**
 * Simple client to stream audio.
 */
export class StreamClient {
	rtsp: RtspSession;
	context: StreamContext;
	settings: Settings;
	private _controlSocket: dgram.Socket | null = null;
	private _controlSyncTimer: ReturnType<typeof setInterval> | null = null;
	timingServer: TimingServer | null = null;
	private _packetBacklog: PacketFifo<Buffer> = new PacketFifo(
		PACKET_BACKLOG_SIZE,
	);
	private _encryptionTypes: EncryptionType = EncryptionType.Unknown;
	private _metadataTypes: MetadataType = MetadataType.NotSupported;
	private _metadata: MediaMetadata = EMPTY_METADATA;
	private _listener: WeakRef<RaopListener> | null = null;
	private _info: Record<string, unknown> = {};
	private _properties: Record<string, string> = {};
	private _isPlaying = false;
	private _protocol: StreamProtocol;

	constructor(
		rtsp: RtspSession,
		context: StreamContext,
		protocol: StreamProtocol,
		settings: Settings,
	) {
		this.rtsp = rtsp;
		this.context = context;
		this.settings = settings;
		this._protocol = protocol;
	}

	get listener(): RaopListener | null {
		if (this._listener === null) return null;
		return this._listener.deref() ?? null;
	}

	set listener(newListener: RaopListener | null) {
		if (newListener !== null) {
			this._listener = new WeakRef(newListener);
		} else {
			this._listener = null;
		}
	}

	get playbackInfo(): PlaybackInfo {
		const metadata =
			Object.keys(this._metadata).length === 0
				? MISSING_METADATA
				: this._metadata;
		return { metadata, position: this.context.position };
	}

	get info(): Record<string, unknown> {
		return this._info;
	}

	close(): void {
		this._protocol.teardown();
		this._stopControlSync();
		if (this._controlSocket) {
			this._controlSocket.close();
			this._controlSocket = null;
		}
		if (this.timingServer) {
			this.timingServer.close();
			this.timingServer = null;
		}
	}

	async initialize(properties: Record<string, string>): Promise<void> {
		this._properties = properties;
		this._encryptionTypes = getEncryptionTypes(properties);
		this._metadataTypes = getMetadataTypes(properties);

		const intersection = this._encryptionTypes & SUPPORTED_ENCRYPTIONS;
		if (!intersection || intersection === EncryptionType.Unknown) {
			// No supported encryption type, continuing anyway
		}

		this._updateOutputProperties(properties);

		// Create control client UDP socket
		this._controlSocket = dgram.createSocket("udp4");
		await new Promise<void>((resolve, reject) => {
			this._controlSocket?.on("error", reject);
			this._controlSocket?.bind(
				this.settings.protocols.raop.controlPort,
				this.rtsp.connection.localIp,
				() => resolve(),
			);
		});

		// Set up control message handler
		this._controlSocket.on("message", (data, rinfo) => {
			this._handleControlData(data, rinfo);
		});

		// Create timing server
		this.timingServer = new TimingServer();
		await this.timingServer.start(
			this.rtsp.connection.localIp,
			this.settings.protocols.raop.timingPort,
		);

		const controlPort = (this._controlSocket.address() as AddressInfo).port;

		// Get device info
		Object.assign(this._info, await this.rtsp.info());

		// Handle auth setup for MFiSAP devices (e.g. AirPort Express)
		if (this._requiresAuthSetup) {
			await this.rtsp.authSetup();
		}

		// Set up the streaming session
		await this._protocol.setup(this.timingServer.port, controlPort);
	}

	private _updateOutputProperties(properties: Record<string, string>): void {
		const [sampleRate, channels, bytesPerChannel] =
			getAudioProperties(properties);
		this.context.sampleRate = sampleRate;
		this.context.channels = channels;
		this.context.bytesPerChannel = bytesPerChannel;
	}

	private get _requiresAuthSetup(): boolean {
		const modelName = this._properties.am ?? "";
		return (
			(this._encryptionTypes & EncryptionType.MFiSAP) !== 0 &&
			modelName.startsWith("AirPort")
		);
	}

	stop(): void {
		this._isPlaying = false;
	}

	async setVolume(volume: number): Promise<void> {
		await this.rtsp.setParameter("volume", String(volume));
		this.context.volume = volume;
	}

	async sendAudio(
		source: AudioSource,
		metadata: MediaMetadata = EMPTY_METADATA,
		options?: { volume?: number | null },
	): Promise<void> {
		if (this._controlSocket === null || this.timingServer === null) {
			throw new Error("not initialized");
		}

		this.context.reset();

		let audioSocket: dgram.Socket | null = null;
		try {
			// Create a socket for writing audio packets
			audioSocket = dgram.createSocket("udp4");
			await new Promise<void>((resolve, reject) => {
				audioSocket?.on("error", reject);
				audioSocket?.connect(
					this.context.serverPort,
					this.rtsp.connection.remoteIp,
					() => resolve(),
				);
			});

			// Start sending sync packets
			this._startControlSync(this.rtsp.connection.remoteIp);

			// Send progress if supported by receiver
			if (this._metadataTypes & MetadataType.Progress) {
				const start = this.context.rtptime;
				const now = this.context.rtptime;
				const end = start + source.duration * this.context.sampleRate;
				await this.rtsp.setParameter("progress", `${start}/${now}/${end}`);
			}

			// Apply text metadata if supported
			this._metadata = metadata;
			if (this._metadataTypes & MetadataType.Text) {
				await this.rtsp.setMetadata(
					this.context.rtspSession,
					this.context.rtpseq,
					this.context.rtptime,
					this.playbackInfo.metadata,
				);
			}

			// Send artwork if supported
			if (this._metadataTypes & MetadataType.Artwork && metadata.artwork) {
				await this.rtsp.setArtwork(
					this.context.rtspSession,
					this.context.rtpseq,
					this.context.rtptime,
					metadata.artwork,
				);
			}

			// Start keep-alive task
			await this._protocol.startFeedback();

			const currentListener = this.listener;
			if (currentListener) {
				currentListener.playing(this.playbackInfo);
			}

			// Start playback
			await this.rtsp.record();

			await this.rtsp.flush({
				headers: {
					Range: "npt=0-",
					Session: String(this.context.rtspSession),
					"RTP-Info": `seq=${this.context.rtpseq};rtptime=${this.context.rtptime}`,
				},
			});

			if (options?.volume) {
				await this.setVolume(options.volume);
			}

			await this._streamData(source, audioSocket);
		} finally {
			this._packetBacklog.clear();
			if (audioSocket) {
				await this.rtsp.teardown(this.context.rtspSession);
				audioSocket.close();
			}
			this._protocol.teardown();
			this.close();

			const currentListener = this.listener;
			if (currentListener) {
				currentListener.stopped();
			}
		}
	}

	private async _streamData(
		source: AudioSource,
		transport: dgram.Socket,
	): Promise<void> {
		const stats = new Statistics(this.context.sampleRate);

		const initialTime = performance.now();
		this._isPlaying = true;
		let prevSlowSeqno: number | null = null;
		let numberSlowSeqno = 0;

		while (this._isPlaying) {
			const currentSeqno = this.context.rtpseq - 1;

			const numSent = await this._sendPacket(
				source,
				stats.totalFrames === 0,
				transport,
			);
			if (numSent === 0) break;

			stats.tick(numSent);
			const framesBehind = stats.framesBehind;

			// If we are late, send some additional frames to catch up
			if (framesBehind >= FRAMES_PER_PACKET) {
				const maxPackets = Math.min(
					Math.floor(framesBehind / FRAMES_PER_PACKET),
					MAX_PACKETS_COMPENSATE,
				);
				const [compensatedFrames, hasMore] = await this._sendNumberOfPackets(
					source,
					transport,
					maxPackets,
				);
				stats.tick(compensatedFrames);
				if (!hasMore) break;
			}

			// Calculate sleep time
			const absTimeStream = stats.totalFrames / this.context.sampleRate;
			const relToStart = (performance.now() - initialTime) / 1000;
			const diff = absTimeStream - relToStart;
			if (diff > 0) {
				numberSlowSeqno = 0;
				await new Promise<void>((resolve) => setTimeout(resolve, diff * 1000));
			} else {
				if (prevSlowSeqno === currentSeqno - 1) {
					numberSlowSeqno += 1;
				}
				if (numberSlowSeqno >= SLOW_WARNING_THRESHOLD) {
					// Too slow to keep up
				}
				prevSlowSeqno = currentSeqno;
			}
		}
	}

	private async _sendPacket(
		source: AudioSource,
		firstPacket: boolean,
		transport: dgram.Socket,
	): Promise<number> {
		// Once all frames have been sent, send padding until we catch up
		if (this.context.paddingSent >= this.context.latency) {
			return 0;
		}

		let frames = await source.readframes(FRAMES_PER_PACKET);
		if (frames.length === 0) {
			// No more frames; send padding packets
			frames = Buffer.alloc(this.context.packetSize);
			this.context.paddingSent += Math.floor(
				frames.length / this.context.frameSize,
			);
		} else if (frames.length !== this.context.packetSize) {
			// Pad the last packet with zeros
			const padded = Buffer.alloc(this.context.packetSize);
			frames.copy(padded);
			frames = padded;
		}

		const header = AudioPacketHeader.encode(
			0x80,
			firstPacket ? 0xe0 : 0x60,
			this.context.rtpseq,
			this.context.rtptime,
			this.rtsp.sessionId,
		);

		// Send packet and add it to backlog
		const [rtpseq, packet] = await this._protocol.sendAudioPacket(
			transport,
			header,
			frames,
		);
		this._packetBacklog.set(rtpseq, packet);

		this.context.rtpseq = (this.context.rtpseq + 1) % 2 ** 16;
		this.context.headTs += Math.floor(frames.length / this.context.frameSize);

		return Math.floor(frames.length / this.context.frameSize);
	}

	private async _sendNumberOfPackets(
		source: AudioSource,
		transport: dgram.Socket,
		count: number,
	): Promise<[number, boolean]> {
		let totalFrames = 0;
		for (let i = 0; i < count; i++) {
			const sent = await this._sendPacket(source, false, transport);
			totalFrames += sent;
			if (sent === 0) {
				return [totalFrames, false];
			}
		}
		return [totalFrames, true];
	}

	private _startControlSync(addr: string): void {
		let firstPacket = true;

		this._controlSyncTimer = setInterval(() => {
			if (this._controlSocket === null) return;

			const currentTime = timing.ts2ntp(
				this.context.headTs,
				this.context.sampleRate,
			);
			const [currentSec, currentFrac] = timing.ntp2parts(currentTime);

			const packet = SyncPacket.encode(
				firstPacket ? 0x90 : 0x80,
				0xd4,
				0x0007,
				this.context.rtptime - this.context.latency,
				currentSec,
				currentFrac,
				this.context.rtptime,
			);

			firstPacket = false;
			this._controlSocket.send(packet, this.context.controlPort, addr);
		}, 1000);
	}

	private _stopControlSync(): void {
		if (this._controlSyncTimer) {
			clearInterval(this._controlSyncTimer);
			this._controlSyncTimer = null;
		}
	}

	private _handleControlData(data: Buffer, rinfo: dgram.RemoteInfo): void {
		const actualType = data[1] & 0x7f;
		if (actualType === 0x55) {
			this._retransmitLostPackets(RetransmitRequest.decode(data, true), rinfo);
		}
	}

	private _retransmitLostPackets(
		request: Record<string, number | Buffer>,
		rinfo: dgram.RemoteInfo,
	): void {
		const lostSeqno = request.lost_seqno as number;
		const lostPackets = request.lost_packets as number;

		for (let i = 0; i < lostPackets; i++) {
			const seqno = lostSeqno + i;
			const packet = this._packetBacklog.get(seqno);
			if (packet) {
				const originalSeqno = packet.subarray(2, 4);
				const resp = Buffer.concat([
					Buffer.from([0x80, 0xd6]),
					originalSeqno,
					packet,
				]);
				this._controlSocket?.send(resp, rinfo.port, rinfo.address);
			}
		}
	}
}
