/**
 * API for performing and verifying device authentication via HAP.
 */

import type {
	HapCredentials,
	PairSetupProcedure,
	PairVerifyProcedure,
} from "../../../auth/hapPairing.js";
import type { SRPAuthHandler } from "../../../auth/hapSrp.js";
import * as hapTlv8 from "../../../auth/hapTlv8.js";
import { InvalidResponseError } from "../../../exceptions.js";
import type { HttpConnection, HttpResponse } from "../../../support/http.js";
import { logBinary } from "../../../support/utils.js";

const AIRPLAY_HEADERS: Record<string, string> = {
	"User-Agent": "AirPlay/320.20",
	Connection: "keep-alive",
	"X-Apple-HKP": "3",
	"Content-Type": "application/octet-stream",
};

function getPairingData(resp: HttpResponse): Map<number, Buffer> {
	if (!Buffer.isBuffer(resp.body)) {
		throw new InvalidResponseError(`got unexpected response: ${resp.body}`);
	}
	return hapTlv8.readTlv(resp.body);
}

/**
 * Authenticate a device for AirPlay playback via HAP.
 */
export class AirPlayHapPairSetupProcedure implements PairSetupProcedure {
	private http: HttpConnection;
	private srp: SRPAuthHandler;
	private _atvSalt: Buffer | null = null;
	private _atvPubKey: Buffer | null = null;

	constructor(http: HttpConnection, authHandler: SRPAuthHandler) {
		this.http = http;
		this.srp = authHandler;
	}

	async startPairing(): Promise<void> {
		this.srp.initialize();

		await this.http.post("/pair-pin-start", { headers: AIRPLAY_HEADERS });

		const data = new Map<number, Buffer>();
		data.set(hapTlv8.TlvValue.Method, Buffer.from([0x00]));
		data.set(hapTlv8.TlvValue.SeqNo, Buffer.from([0x01]));
		const resp = await this.http.post("/pair-setup", {
			body: hapTlv8.writeTlv(data),
			headers: AIRPLAY_HEADERS,
		});
		const pairingData = getPairingData(resp);

		this._atvSalt = pairingData.get(hapTlv8.TlvValue.Salt)!;
		this._atvPubKey = pairingData.get(hapTlv8.TlvValue.PublicKey)!;
	}

	async finishPairing(
		_username: string,
		pinCode: number,
		displayName?: string | null,
	): Promise<HapCredentials> {
		// Step 1
		this.srp.step1(pinCode);

		const [pubKey, proof] = this.srp.step2(this._atvPubKey!, this._atvSalt!);
		const data1 = new Map<number, Buffer>();
		data1.set(hapTlv8.TlvValue.SeqNo, Buffer.from([0x03]));
		data1.set(hapTlv8.TlvValue.PublicKey, pubKey);
		data1.set(hapTlv8.TlvValue.Proof, proof);
		await this.http.post("/pair-setup", {
			body: hapTlv8.writeTlv(data1),
			headers: AIRPLAY_HEADERS,
		});

		const data2 = new Map<number, Buffer>();
		data2.set(hapTlv8.TlvValue.SeqNo, Buffer.from([0x05]));
		data2.set(hapTlv8.TlvValue.EncryptedData, this.srp.step3(displayName));
		const resp = await this.http.post("/pair-setup", {
			body: hapTlv8.writeTlv(data2),
			headers: AIRPLAY_HEADERS,
		});
		const pairingData = getPairingData(resp);

		const encryptedData = pairingData.get(hapTlv8.TlvValue.EncryptedData)!;
		return this.srp.step4(encryptedData);
	}
}

const _logger = {
	isEnabledFor: () => false,
	debug: (..._args: unknown[]) => {},
};

/**
 * Verify if a device is allowed to perform AirPlay playback via HAP.
 */
export class AirPlayHapPairVerifyProcedure implements PairVerifyProcedure {
	private http: HttpConnection;
	private srp: SRPAuthHandler;
	private credentials: HapCredentials;

	constructor(
		http: HttpConnection,
		authHandler: SRPAuthHandler,
		credentials: HapCredentials,
	) {
		this.http = http;
		this.srp = authHandler;
		this.credentials = credentials;
	}

	async verifyCredentials(): Promise<boolean> {
		const [, publicKey] = this.srp.initialize();

		const data1 = new Map<number, Buffer>();
		data1.set(hapTlv8.TlvValue.SeqNo, Buffer.from([0x01]));
		data1.set(hapTlv8.TlvValue.PublicKey, publicKey);
		const resp = await this._send(data1);

		const pairingData = getPairingData(resp);
		const sessionPubKey = pairingData.get(hapTlv8.TlvValue.PublicKey)!;
		const encrypted = pairingData.get(hapTlv8.TlvValue.EncryptedData)!;
		logBinary(_logger, "Device", {
			Public: this.credentials.ltpk,
			Encrypted: encrypted,
		});

		const encryptedData = this.srp.verify1(
			this.credentials,
			sessionPubKey,
			encrypted,
		);
		const data2 = new Map<number, Buffer>();
		data2.set(hapTlv8.TlvValue.SeqNo, Buffer.from([0x03]));
		data2.set(hapTlv8.TlvValue.EncryptedData, encryptedData);
		await this._send(data2);

		return true;
	}

	private async _send(data: Map<number, Buffer>): Promise<HttpResponse> {
		const headers = { ...AIRPLAY_HEADERS };
		headers["Content-Type"] = "application/octet-stream";
		return this.http.post("/pair-verify", {
			body: hapTlv8.writeTlv(data),
			headers,
		});
	}

	encryptionKeys(
		salt: string,
		outputInfo: string,
		inputInfo: string,
	): [Buffer, Buffer] {
		return this.srp.verify2(salt, outputInfo, inputInfo);
	}
}
