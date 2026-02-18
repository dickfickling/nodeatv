/**
 * Play media on a device by sending a URL.
 */

import {
	AuthenticationError,
	ConnectionLostError,
	PlaybackError,
} from "../../exceptions.js";
import { decodeBplistFromBody } from "../../support/http.js";
import type { RtspSession } from "../../support/rtsp.js";

const PLAY_RETRIES = 3;
const WAIT_RETRIES = 5;

export const PLAY_HEADERS: Record<string, string> = {
	"User-Agent": "AirPlay/550.10",
	"Content-Type": "application/x-apple-binary-plist",
	"X-Apple-ProtocolVersion": "1",
	"X-Apple-Stream-ID": "1",
};

/**
 * Stream protocol interface for AirPlay URL playback.
 */
export interface StreamProtocol {
	playUrl(
		timingPort: number,
		url: string,
		position: number,
	): Promise<{ code: number }>;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * This class helps with playing media from a URL.
 */
export class AirPlayPlayer {
	rtsp: RtspSession;
	streamProtocol: StreamProtocol;

	constructor(rtsp: RtspSession, streamProtocol: StreamProtocol) {
		this.rtsp = rtsp;
		this.streamProtocol = streamProtocol;
	}

	async playUrl(url: string, position = 0): Promise<void> {
		let retry = 0;

		while (retry < PLAY_RETRIES) {
			const resp = await this.streamProtocol.playUrl(0, url, position);

			if (resp.code === 500) {
				retry += 1;
				await sleep(1000);
				continue;
			}

			if (resp.code >= 400 && resp.code < 600) {
				throw new AuthenticationError(`status code: ${resp.code}`);
			}

			await this._waitForMediaToEnd();
			return;
		}

		throw new PlaybackError("Max retries exceeded");
	}

	private async _waitForMediaToEnd(): Promise<void> {
		let attempts = WAIT_RETRIES;
		let videoStarted = false;

		while (true) {
			let parsed: Record<string, unknown>;

			try {
				const resp = await this.rtsp.connection.get("/playback-info");
				if (resp.body) {
					parsed = decodeBplistFromBody(resp);
				} else {
					parsed = {};
				}
			} catch (ex) {
				if (ex instanceof ConnectionLostError || ex instanceof Error) {
					break;
				}
				break;
			}

			if ("error" in parsed) {
				const error = parsed.error as Record<string, unknown>;
				const code = error?.code ?? "unknown";
				const domain = error?.domain ?? "unknown domain";
				throw new PlaybackError(
					`got error ${code} (${domain}) when playing video`,
				);
			}

			if ("duration" in parsed) {
				videoStarted = true;
				attempts = -1;
			} else {
				videoStarted = false;
				if (attempts >= 0) {
					attempts -= 1;
				}
			}

			if (!videoStarted && attempts < 0) {
				break;
			}

			await sleep(1000);
		}
	}
}
