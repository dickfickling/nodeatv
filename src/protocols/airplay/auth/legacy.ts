/**
 * Implementation of legacy pairing for AirPlay.
 */

import type {
	HapCredentials,
	PairSetupProcedure,
	PairVerifyProcedure,
} from "../../../auth/hapPairing.js";
import { NotSupportedError, ProtocolError } from "../../../exceptions.js";
import type { HttpConnection, HttpResponse } from "../../../support/http.js";
import { decodeBplistFromBody } from "../../../support/http.js";
import type { LegacySRPAuthHandler } from "../srp.js";

const AIRPLAY_HEADERS: Record<string, string> = {
	"User-Agent": "AirPlay/320.20",
	Connection: "keep-alive",
};

/**
 * Authenticate a device for AirPlay playback using legacy auth.
 */
export class AirPlayLegacyPairSetupProcedure implements PairSetupProcedure {
	private http: HttpConnection;
	private srp: LegacySRPAuthHandler;

	constructor(http: HttpConnection, authHandler: LegacySRPAuthHandler) {
		this.http = http;
		this.srp = authHandler;
	}

	async startPairing(): Promise<void> {
		await this.http.post("/pair-pin-start", { headers: AIRPLAY_HEADERS });
	}

	async finishPairing(
		_username: string,
		pinCode: number,
		_displayName?: string | null,
	): Promise<HapCredentials> {
		// Step 1
		const clientId = this.srp.credentials.clientId
			.toString("hex")
			.toUpperCase();
		this.srp.step1(clientId, pinCode);
		const resp = await this._sendPlist({ method: "pin", user: clientId });
		const body = decodeBplistFromBody(resp);
		if (typeof body !== "object" || body === null) {
			throw new ProtocolError(`expected dict, got ${typeof body}`);
		}

		// Step 2
		const [pubKey, keyProof] = this.srp.step2(
			(body as Record<string, Buffer>).pk,
			(body as Record<string, Buffer>).salt,
		);
		await this._sendPlist({
			pk: Buffer.from(pubKey, "hex"),
			proof: Buffer.from(keyProof, "hex"),
		});

		// Step 3
		const [epk, tag] = this.srp.step3();
		await this._sendPlist({ epk, authTag: tag });
		return this.srp.credentials;
	}

	private async _sendPlist(
		kwargs: Record<string, unknown>,
	): Promise<HttpResponse> {
		const plist: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(kwargs)) {
			plist[String(k)] = v;
		}

		const headers = { ...AIRPLAY_HEADERS };
		headers["Content-Type"] = "application/x-apple-binary-plist";

		let body: Buffer;
		try {
			const bplistCreator = require("bplist-creator") as (
				obj: unknown,
			) => Buffer;
			body = bplistCreator(plist);
		} catch {
			body = Buffer.from(JSON.stringify(plist), "utf-8");
		}

		return this.http.post("/pair-setup-pin", { body, headers });
	}
}

/**
 * Verify if a device is allowed to perform AirPlay playback using legacy auth.
 */
export class AirPlayLegacyPairVerifyProcedure implements PairVerifyProcedure {
	private http: HttpConnection;
	private srp: LegacySRPAuthHandler;

	constructor(http: HttpConnection, authHandler: LegacySRPAuthHandler) {
		this.http = http;
		this.srp = authHandler;
	}

	async verifyCredentials(): Promise<boolean> {
		const resp = await this._send(this.srp.verify1());

		const bodyBuf = Buffer.isBuffer(resp.body)
			? resp.body
			: Buffer.from(resp.body as string, "utf-8");
		const atvPublicSecret = bodyBuf.subarray(0, 32);
		const data = bodyBuf.subarray(32);
		await this._send(this.srp.verify2(atvPublicSecret, data));
		return false;
	}

	private async _send(data: Buffer): Promise<HttpResponse> {
		const headers = { ...AIRPLAY_HEADERS };
		headers["Content-Type"] = "application/octet-stream";
		return this.http.post("/pair-verify", { headers, body: data });
	}

	encryptionKeys(
		_salt: string,
		_outputInfo: string,
		_inputInfo: string,
	): [Buffer, Buffer] {
		throw new NotSupportedError("encryption keys not supported by legacy auth");
	}
}
