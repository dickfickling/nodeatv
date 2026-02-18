/**
 * Implementation of AirPlay v2 protocol logic.
 */

import { createCipheriv, randomBytes } from "node:crypto";
import type * as dgram from "node:dgram";
import {
	AuthenticationType,
	parseCredentials,
} from "../../../auth/hapPairing.js";
import { decodeBplistFromBody } from "../../../support/http.js";
import type { RtspSession } from "../../../support/rtsp.js";
import { verifyConnection } from "../../airplay/auth/index.js";
import type { StreamContext, StreamProtocol } from "./index.js";

const FEEDBACK_INTERVAL = 2000; // milliseconds

/**
 * Stream protocol used for AirPlay v2 support.
 */
export class AirPlayV2 implements StreamProtocol {
	context: StreamContext;
	rtsp: RtspSession;
	private _feedbackTimer: ReturnType<typeof setInterval> | null = null;
	private _audioKey: Buffer = Buffer.alloc(0);

	constructor(context: StreamContext, rtsp: RtspSession) {
		this.context = context;
		this.rtsp = rtsp;
	}

	async setup(
		timingServerPort: number,
		controlClientPort: number,
	): Promise<void> {
		const credentials = parseCredentials(this.context.credentials);
		if (credentials.type !== AuthenticationType.Null) {
			await verifyConnection(credentials, this.rtsp.connection);
		}

		// Initial setup to establish the session
		await this.rtsp.setup({
			body: {
				deviceID: "AA:BB:CC:DD:EE:FF",
				timingPort: timingServerPort,
				timingProtocol: "NTP",
				isMultiSelectAirPlay: true,
				groupContainsGroupLeader: false,
				macAddress: "AA:BB:CC:DD:EE:FF",
				model: "iPhone14,3",
				name: "nodeatv",
				osBuildVersion: "20F66",
				osName: "iPhone OS",
				osVersion: "16.5",
				senderSupportsRelay: false,
				sourceVersion: "690.7.1",
				statsCollectionEnabled: false,
			},
		});

		// Setup audio stream
		await this._setupAudioStream(controlClientPort);
	}

	private async _setupAudioStream(controlClientPort: number): Promise<void> {
		this._audioKey = randomBytes(32);

		const setupResp = await this.rtsp.setup({
			body: {
				streams: [
					{
						audioFormat: 0x800,
						audioMode: "default",
						controlPort: controlClientPort,
						ct: 1, // Raw PCM
						isMedia: true,
						latencyMax: 88200,
						latencyMin: 11025,
						shk: this._audioKey,
						spf: 352, // Samples Per Frame
						sr: 44100, // Sample rate
						type: 0x60,
						supportsDynamicStreamID: false,
						streamConnectionID: this.rtsp.sessionId,
					},
				],
			},
		});

		const body = decodeBplistFromBody(setupResp);
		if (body.streams && Array.isArray(body.streams)) {
			const stream = body.streams[0] as Record<string, number>;
			this.context.controlPort = stream.controlPort ?? 0;
			this.context.serverPort = stream.dataPort ?? 0;
		}
	}

	teardown(): void {
		if (this._feedbackTimer) {
			clearInterval(this._feedbackTimer);
			this._feedbackTimer = null;
		}
	}

	async startFeedback(): Promise<void> {
		if (this._feedbackTimer === null) {
			this._feedbackTimer = setInterval(async () => {
				try {
					await this.rtsp.feedback();
				} catch {
					// feedback is best-effort
				}
			}, FEEDBACK_INTERVAL);
		}
	}

	async sendAudioPacket(
		transport: dgram.Socket,
		rtpHeader: Buffer,
		audio: Buffer,
	): Promise<[number, Buffer]> {
		const nonce = Buffer.alloc(12);
		nonce.writeUIntLE(this.context.rtpseq, 0, 6);

		const aad = rtpHeader.subarray(0, 4);
		const cipher = createCipheriv("chacha20-poly1305", this._audioKey, nonce, {
			authTagLength: 16,
		});
		cipher.setAAD(aad, { plaintextLength: audio.length });
		const encrypted = cipher.update(audio);
		cipher.final();
		const tag = cipher.getAuthTag();

		const packet = Buffer.concat([rtpHeader, encrypted, tag]);
		transport.send(packet);
		return [this.context.rtpseq, packet];
	}

	async playUrl(
		_timingServerPort: number,
		_url: string,
		_position = 0.0,
	): Promise<unknown> {
		// TODO: Implement play_url for AirPlay v2
		throw new Error("playUrl not implemented for AirPlay v2");
	}
}
