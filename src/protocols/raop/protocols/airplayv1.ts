/**
 * Implementation of AirPlay v1 protocol logic.
 */

import type * as dgram from "node:dgram";
import {
	AuthenticationType,
	parseCredentials,
} from "../../../auth/hapPairing.js";
import type { RtspSession } from "../../../support/rtsp.js";
import { verifyConnection } from "../../airplay/auth/index.js";
import type { StreamContext, StreamProtocol } from "./index.js";

const KEEP_ALIVE_INTERVAL = 25_000; // milliseconds

/**
 * Parse Transport header in SETUP response.
 */
export function parseTransport(
	transport: string,
): [string[], Record<string, string>] {
	const params: string[] = [];
	const options: Record<string, string> = {};
	for (const option of transport.split(";")) {
		if (option.includes("=")) {
			const [key, value] = option.split("=", 2);
			options[key] = value;
		} else {
			params.push(option);
		}
	}
	return [params, options];
}

/**
 * Stream protocol used for AirPlay v1 support.
 */
export class AirPlayV1 implements StreamProtocol {
	context: StreamContext;
	rtsp: RtspSession;
	private _keepAliveTimer: ReturnType<typeof setInterval> | null = null;

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

		await this.rtsp.announce(
			this.context.bytesPerChannel,
			this.context.channels,
			this.context.sampleRate,
			this.context.password,
		);

		const resp = await this.rtsp.setup({
			headers: {
				Transport:
					"RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;" +
					`control_port=${controlClientPort};` +
					`timing_port=${timingServerPort}`,
			},
		});

		const headers = resp.headers as Record<string, string>;
		const [, options] = parseTransport(headers.Transport ?? "");
		this.context.timingPort = Number.parseInt(options.timing_port ?? "0", 10);
		this.context.controlPort = Number.parseInt(options.control_port, 10);
		this.context.rtspSession = Number.parseInt(headers.Session, 10);
		this.context.serverPort = Number.parseInt(options.server_port, 10);
	}

	teardown(): void {
		if (this._keepAliveTimer) {
			clearInterval(this._keepAliveTimer);
			this._keepAliveTimer = null;
		}
	}

	async startFeedback(): Promise<void> {
		const feedback = await this.rtsp.feedback(true);
		if (feedback.code === 200) {
			this._keepAliveTimer = setInterval(async () => {
				try {
					await this.rtsp.feedback();
				} catch {
					// feedback is best-effort
				}
			}, KEEP_ALIVE_INTERVAL);
		}
	}

	async sendAudioPacket(
		transport: dgram.Socket,
		rtpHeader: Buffer,
		audio: Buffer,
	): Promise<[number, Buffer]> {
		const packet = Buffer.concat([rtpHeader, audio]);
		transport.send(packet);
		return [this.context.rtpseq, packet];
	}

	async playUrl(
		_timingServerPort: number,
		_url: string,
		_position = 0.0,
	): Promise<unknown> {
		// TODO: Implement play_url for AirPlay v1
		throw new Error("playUrl not implemented for AirPlay v1");
	}
}
