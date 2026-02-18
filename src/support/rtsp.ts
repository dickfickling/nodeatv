/**
 * Implementation of the RTSP protocol.
 *
 * This is a simple implementation of the RTSP protocol used by Apple (with its quirks
 * and all). It is somewhat generalized to support both AirPlay 1 and 2.
 */

import { createHash } from "node:crypto";
import type { MediaMetadata } from "../interface.js";
import { containerTag, stringTag } from "../protocols/dmap/tags.js";
import type { HttpConnection, HttpResponse } from "./http.js";
import { decodeBplistFromBody } from "./http.js";

const FRAMES_PER_PACKET = 352;
const USER_AGENT = "AirPlay/550.10";
const HTTP_PROTOCOL = "HTTP/1.1";

const ANNOUNCE_PAYLOAD =
	"v=0\r\n" +
	"o=iTunes {session_id} 0 IN IP4 {local_ip}\r\n" +
	"s=iTunes\r\n" +
	"c=IN IP4 {remote_ip}\r\n" +
	"t=0 0\r\n" +
	"m=audio 0 RTP/AVP 96\r\n" +
	"a=rtpmap:96 L16/44100/2\r\n" +
	`a=fmtp:96 ${FRAMES_PER_PACKET} 0 ` +
	"{bits_per_channel} 40 10 14 {channels} 255 0 0 {sample_rate}\r\n";

/** Used to signal that traffic is to be unencrypted. */
const AUTH_SETUP_UNENCRYPTED = Buffer.from([0x01]);

/**
 * Just a static Curve25519 public key used to satisfy the auth-setup step for devices
 * requiring that (e.g. AirPort Express). We never verify anything.
 */
const CURVE25519_PUB_KEY = Buffer.from([
	0x59, 0x02, 0xed, 0xe9, 0x0d, 0x4e, 0xf2, 0xbd, 0x4c, 0xb6, 0x8a, 0x63, 0x30,
	0x03, 0x82, 0x07, 0xa9, 0x4d, 0xbd, 0x50, 0xd8, 0xaa, 0x46, 0x5b, 0x5d, 0x8c,
	0x01, 0x2a, 0x0c, 0x7e, 0x1d, 0x4e,
]);

const BPLIST_CONTENT_TYPE = "application/x-apple-binary-plist";

export interface DigestInfo {
	username: string;
	realm: string;
	password: string;
	nonce: string;
}

function md5Hex(input: string): string {
	return createHash("md5").update(input, "utf-8").digest("hex");
}

export function getDigestPayload(
	method: string,
	uri: string,
	user: string,
	realm: string,
	pwd: string,
	nonce: string,
): string {
	const ha1 = md5Hex(`${user}:${realm}:${pwd}`);
	const ha2 = md5Hex(`${method}:${uri}`);
	const diResponse = md5Hex(`${ha1}:${nonce}:${ha2}`);
	return `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${diResponse}"`;
}

function formatTemplate(
	template: string,
	values: Record<string, string | number>,
): string {
	let result = template;
	for (const [key, value] of Object.entries(values)) {
		result = result.replaceAll(`{${key}}`, String(value));
	}
	return result;
}

/**
 * Representation of an RTSP session.
 */
export class RtspSession {
	connection: HttpConnection;
	digestInfo: DigestInfo | null = null;
	cseq = 0;
	sessionId: number;
	dacpId: string;
	activeRemote: number;

	constructor(connection: HttpConnection) {
		this.connection = connection;
		this.sessionId = Math.floor(Math.random() * 0x100000000);
		this.dacpId = Math.floor(Math.random() * 0x10000000000000000)
			.toString(16)
			.toUpperCase();
		this.activeRemote = Math.floor(Math.random() * 0x100000000);
	}

	get uri(): string {
		return `rtsp://${this.connection.localIp}/${this.sessionId}`;
	}

	async info(): Promise<Record<string, unknown>> {
		const deviceInfo = await this.exchange("GET", {
			uri: "/info",
			allowError: true,
		});

		if (deviceInfo.code !== 200) {
			return {};
		}

		return decodeBplistFromBody(deviceInfo);
	}

	async authSetup(): Promise<HttpResponse> {
		const body = Buffer.concat([AUTH_SETUP_UNENCRYPTED, CURVE25519_PUB_KEY]);

		return this.exchange("POST", {
			uri: "/auth-setup",
			contentType: "application/octet-stream",
			body,
			protocol: HTTP_PROTOCOL,
		});
	}

	async announce(
		bytesPerChannel: number,
		channels: number,
		sampleRate: number,
		password: string | null,
	): Promise<HttpResponse> {
		const body = formatTemplate(ANNOUNCE_PAYLOAD, {
			session_id: this.sessionId,
			local_ip: this.connection.localIp,
			remote_ip: this.connection.remoteIp,
			bits_per_channel: 8 * bytesPerChannel,
			channels,
			sample_rate: sampleRate,
		});

		const requiresPassword = password !== null;

		let response = await this.exchange("ANNOUNCE", {
			contentType: "application/sdp",
			body,
			allowError: requiresPassword,
		});

		const wwwAuthenticate =
			response.headers instanceof Map
				? response.headers.get("www-authenticate")
				: (response.headers as Record<string, string>)["www-authenticate"];

		if (response.code === 401 && wwwAuthenticate && requiresPassword) {
			const parts = wwwAuthenticate.split('"');
			const realm = parts[1];
			const nonce = parts[3];
			this.digestInfo = {
				username: "pyatv",
				realm,
				password,
				nonce,
			};

			response = await this.exchange("ANNOUNCE", {
				contentType: "application/sdp",
				body,
			});
		}

		return response;
	}

	async setup(options?: {
		headers?: Record<string, string>;
		body?: string | Buffer | Record<string, unknown>;
	}): Promise<HttpResponse> {
		return this.exchange("SETUP", {
			headers: options?.headers,
			body: options?.body,
		});
	}

	async record(options?: {
		headers?: Record<string, string>;
		body?: string | Buffer;
	}): Promise<HttpResponse> {
		return this.exchange("RECORD", {
			headers: options?.headers,
			body: options?.body,
		});
	}

	async flush(options?: {
		headers?: Record<string, string>;
		body?: string | Buffer;
	}): Promise<HttpResponse> {
		return this.exchange("FLUSH", {
			headers: options?.headers,
			body: options?.body,
		});
	}

	async setParameter(parameter: string, value: string): Promise<HttpResponse> {
		return this.exchange("SET_PARAMETER", {
			contentType: "text/parameters",
			body: `${parameter}: ${value}`,
		});
	}

	async setMetadata(
		rtspSession: number,
		rtpseq: number,
		rtptime: number,
		metadata: MediaMetadata,
	): Promise<HttpResponse> {
		let payload = Buffer.alloc(0);
		if (metadata.title) {
			payload = Buffer.concat([payload, stringTag("minm", metadata.title)]);
		}
		if (metadata.album) {
			payload = Buffer.concat([payload, stringTag("asal", metadata.album)]);
		}
		if (metadata.artist) {
			payload = Buffer.concat([payload, stringTag("asar", metadata.artist)]);
		}

		return this.exchange("SET_PARAMETER", {
			contentType: "application/x-dmap-tagged",
			headers: {
				Session: String(rtspSession),
				"RTP-Info": `seq=${rtpseq};rtptime=${rtptime}`,
			},
			body: containerTag("mlit", payload),
		});
	}

	async setArtwork(
		rtspSession: number,
		rtpseq: number,
		rtptime: number,
		artwork: Buffer,
	): Promise<HttpResponse> {
		return this.exchange("SET_PARAMETER", {
			contentType: "image/jpeg",
			headers: {
				Session: String(rtspSession),
				"RTP-Info": `seq=${rtpseq};rtptime=${rtptime}`,
			},
			body: artwork,
		});
	}

	async feedback(allowError = false): Promise<HttpResponse> {
		return this.exchange("POST", { uri: "/feedback", allowError });
	}

	async teardown(rtspSession: number): Promise<HttpResponse> {
		return this.exchange("TEARDOWN", {
			headers: { Session: String(rtspSession) },
		});
	}

	async exchange(
		method: string,
		options?: {
			uri?: string;
			contentType?: string;
			headers?: Record<string, string>;
			body?: string | Buffer | Record<string, unknown>;
			allowError?: boolean;
			protocol?: string;
		},
	): Promise<HttpResponse> {
		const uri = options?.uri ?? undefined;
		const contentType = options?.contentType ?? undefined;
		const headers = options?.headers ?? undefined;
		const allowError = options?.allowError ?? false;
		const protocol = options?.protocol ?? "RTSP/1.0";

		const cseq = this.cseq;
		this.cseq += 1;

		const hdrs: Record<string, string> = {
			CSeq: String(cseq),
			"DACP-ID": this.dacpId,
			"Active-Remote": String(this.activeRemote),
			"Client-Instance": this.dacpId,
		};

		if (this.digestInfo) {
			hdrs.Authorization = getDigestPayload(
				method,
				uri ?? this.uri,
				this.digestInfo.username,
				this.digestInfo.realm,
				this.digestInfo.password,
				this.digestInfo.nonce,
			);
		}

		if (headers) {
			Object.assign(hdrs, headers);
		}

		let body: string | Buffer | undefined = options?.body as
			| string
			| Buffer
			| undefined;

		// If body is a plain object (dict), encode as binary plist
		if (
			options?.body !== null &&
			options?.body !== undefined &&
			typeof options?.body === "object" &&
			!Buffer.isBuffer(options?.body)
		) {
			hdrs["Content-Type"] = BPLIST_CONTENT_TYPE;
			// Use bplist-creator to encode as binary plist
			try {
				const bplistCreator = require("bplist-creator") as (
					obj: unknown,
				) => Buffer;
				body = bplistCreator(options.body);
			} catch {
				// Fallback to JSON if bplist-creator not available
				body = Buffer.from(JSON.stringify(options.body), "utf-8");
			}
		}

		const resp = await this.connection.sendAndReceive(method, uri ?? this.uri, {
			protocol,
			userAgent: USER_AGENT,
			contentType,
			headers: hdrs,
			body: body as string | Buffer | undefined,
			allowError,
		});

		return resp;
	}
}

export {
	FRAMES_PER_PACKET,
	USER_AGENT as RTSP_USER_AGENT,
	HTTP_PROTOCOL,
	AUTH_SETUP_UNENCRYPTED,
	CURVE25519_PUB_KEY,
	BPLIST_CONTENT_TYPE,
};
