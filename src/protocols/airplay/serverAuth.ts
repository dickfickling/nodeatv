/**
 * Server-side authentication for AirPlay protocol.
 * Simulates an Apple TV's HTTP-based pairing and verification endpoints.
 * Used for integration testing.
 */

import * as crypto from "node:crypto";
import { hkdfExpand } from "../../auth/hapSrp.js";
import { readTlv, TlvValue, writeTlv } from "../../auth/hapTlv8.js";
import {
	generateKeys,
	newServerSession,
	type ServerKeys,
} from "../../auth/serverAuth.js";
import type { SRPServerSession } from "../../auth/srp.js";
import { Chacha20Cipher8byteNonce } from "../../support/chacha20.js";

/**
 * Hardcoded FairPlay responses for `/fp-setup` (used to bypass FP authentication).
 */
export class PlayFair {
	private _stage = 0;

	// Hardcoded FP response for stage 1 (130 bytes)
	private static readonly FP_STAGE1_RESPONSE = Buffer.alloc(130, 0x42);
	// Hardcoded FP response for stage 2 (32 bytes)
	private static readonly FP_STAGE2_RESPONSE = Buffer.alloc(32, 0x43);

	handleSetup(_data: Buffer): Buffer {
		this._stage++;
		if (this._stage === 1) {
			return PlayFair.FP_STAGE1_RESPONSE;
		}
		return PlayFair.FP_STAGE2_RESPONSE;
	}
}

export abstract class BaseAirPlayServerAuth {
	protected _keys: ServerKeys;
	protected _session: SRPServerSession | null = null;
	protected _pin: number;
	protected _clientPubKey: Buffer | null = null;
	protected _verifyPrivate: crypto.KeyObject | null = null;
	protected _verifyShared: Buffer | null = null;
	private _playFair = new PlayFair();

	constructor(pin = 1111, seed?: Buffer) {
		this._keys = generateKeys(seed);
		this._pin = pin;
	}

	get serverPublicKey(): Buffer {
		return this._keys.publicKey;
	}

	abstract sendToClient(
		statusCode: number,
		body: Buffer,
		headers?: Record<string, string>,
	): Promise<void>;
	abstract enableEncryption(outputKey: Buffer, inputKey: Buffer): void;

	async handlePairSetup(body: Buffer): Promise<Buffer> {
		const tlv = readTlv(body);
		const seqNo = tlv.get(TlvValue.SeqNo)?.[0];

		switch (seqNo) {
			case 0x01:
				return this._pairSetupM1(tlv);
			case 0x03:
				return this._pairSetupM3(tlv);
			case 0x05:
				return this._pairSetupM5(tlv);
			default:
				throw new Error(`Unknown pair-setup seqno: ${seqNo}`);
		}
	}

	async handlePairVerify(body: Buffer): Promise<Buffer> {
		const tlv = readTlv(body);
		const seqNo = tlv.get(TlvValue.SeqNo)?.[0];

		switch (seqNo) {
			case 0x01:
				return this._pairVerifyM1(tlv);
			case 0x03:
				return this._pairVerifyM3(tlv);
			default:
				throw new Error(`Unknown pair-verify seqno: ${seqNo}`);
		}
	}

	async handleFpSetup(body: Buffer): Promise<Buffer> {
		return this._playFair.handleSetup(body);
	}

	async handleInfo(): Promise<Record<string, unknown>> {
		return {
			statusFlags: 4,
			deviceID: "AA:BB:CC:DD:EE:FF",
			features: "0x5A7FFFF7,0x1E",
			model: "AppleTV6,2",
			protocolVersion: "1",
			sourceVersion: "377.40.00",
			name: "AirPlayTestServer",
			pk: this._keys.publicKey.toString("hex"),
		};
	}

	private _pairSetupM1(_tlv: Map<number, Buffer>): Buffer {
		this._session = newServerSession(this._pin);

		const resp = new Map<number, Buffer>();
		resp.set(TlvValue.SeqNo, Buffer.from([0x02]));
		resp.set(TlvValue.Salt, this._session.saltBytes);
		resp.set(TlvValue.PublicKey, this._session.publicBytes);
		return writeTlv(resp);
	}

	private _pairSetupM3(tlv: Map<number, Buffer>): Buffer {
		if (!this._session) {
			throw new Error("No SRP session");
		}

		const clientPubKey = tlv.get(TlvValue.PublicKey)!;
		const clientProof = tlv.get(TlvValue.Proof)!;

		const verified = this._session.processAndVerify(
			clientPubKey.toString("hex"),
			clientProof.toString("hex"),
		);

		if (!verified) {
			const resp = new Map<number, Buffer>();
			resp.set(TlvValue.SeqNo, Buffer.from([0x04]));
			resp.set(TlvValue.Error, Buffer.from([0x02]));
			return writeTlv(resp);
		}

		const resp = new Map<number, Buffer>();
		resp.set(TlvValue.SeqNo, Buffer.from([0x04]));
		resp.set(TlvValue.Proof, Buffer.from(this._session.keyProofHash, "hex"));
		return writeTlv(resp);
	}

	private _pairSetupM5(tlv: Map<number, Buffer>): Buffer {
		if (!this._session) {
			throw new Error("No SRP session");
		}

		const sessionKey = this._session.keyBytes;
		const encryptKey = hkdfExpand(
			"Pair-Setup-Encrypt-Salt",
			"Pair-Setup-Encrypt-Info",
			sessionKey,
		);

		const chacha = new Chacha20Cipher8byteNonce(encryptKey, encryptKey);
		const encryptedData = tlv.get(TlvValue.EncryptedData)!;
		const decrypted = chacha.decrypt(encryptedData, Buffer.from("PS-Msg05"));
		const innerTlv = readTlv(decrypted);

		this._clientPubKey = innerTlv.get(TlvValue.PublicKey) ?? null;

		const serverSignKey = hkdfExpand(
			"Pair-Setup-Accessory-Sign-Salt",
			"Pair-Setup-Accessory-Sign-Info",
			sessionKey,
		);

		const serverId = Buffer.from("AirPlayServerAuth");
		const serverInfo = Buffer.concat([
			serverSignKey,
			serverId,
			this._keys.publicKey,
		]);
		const signature = crypto.sign(null, serverInfo, this._keys.signingKey);

		const responseTlv = new Map<number, Buffer>();
		responseTlv.set(TlvValue.Identifier, serverId);
		responseTlv.set(TlvValue.PublicKey, this._keys.publicKey);
		responseTlv.set(TlvValue.Signature, signature);

		const chacha2 = new Chacha20Cipher8byteNonce(encryptKey, encryptKey);
		const encrypted = chacha2.encrypt(
			writeTlv(responseTlv),
			Buffer.from("PS-Msg06"),
		);

		const resp = new Map<number, Buffer>();
		resp.set(TlvValue.SeqNo, Buffer.from([0x06]));
		resp.set(TlvValue.EncryptedData, encrypted);
		return writeTlv(resp);
	}

	private _pairVerifyM1(tlv: Map<number, Buffer>): Buffer {
		const clientPubKey = tlv.get(TlvValue.PublicKey)!;

		const x25519Keypair = crypto.generateKeyPairSync("x25519");
		this._verifyPrivate = x25519Keypair.privateKey;
		const serverPubKey = Buffer.from(
			x25519Keypair.publicKey
				.export({ type: "spki", format: "der" })
				.subarray(-32),
		);

		const peerKey = crypto.createPublicKey({
			key: Buffer.concat([
				Buffer.from("302a300506032b656e032100", "hex"),
				clientPubKey,
			]),
			format: "der",
			type: "spki",
		});

		this._verifyShared = Buffer.from(
			crypto.diffieHellman({
				privateKey: this._verifyPrivate,
				publicKey: peerKey,
			}),
		);

		const sessionKey = hkdfExpand(
			"Pair-Verify-Encrypt-Salt",
			"Pair-Verify-Encrypt-Info",
			this._verifyShared,
		);

		const serverId = Buffer.from("AirPlayServerAuth");
		const deviceInfo = Buffer.concat([serverPubKey, serverId, clientPubKey]);
		const signature = crypto.sign(null, deviceInfo, this._keys.signingKey);

		const innerTlv = new Map<number, Buffer>();
		innerTlv.set(TlvValue.Identifier, serverId);
		innerTlv.set(TlvValue.Signature, signature);

		const chacha = new Chacha20Cipher8byteNonce(sessionKey, sessionKey);
		const encrypted = chacha.encrypt(
			writeTlv(innerTlv),
			Buffer.from("PV-Msg02"),
		);

		const resp = new Map<number, Buffer>();
		resp.set(TlvValue.SeqNo, Buffer.from([0x02]));
		resp.set(TlvValue.PublicKey, serverPubKey);
		resp.set(TlvValue.EncryptedData, encrypted);
		return writeTlv(resp);
	}

	private _pairVerifyM3(tlv: Map<number, Buffer>): Buffer {
		if (!this._verifyShared) {
			throw new Error("No verify session");
		}

		const sessionKey = hkdfExpand(
			"Pair-Verify-Encrypt-Salt",
			"Pair-Verify-Encrypt-Info",
			this._verifyShared,
		);

		const chacha = new Chacha20Cipher8byteNonce(sessionKey, sessionKey);
		const _decrypted = chacha.decrypt(
			tlv.get(TlvValue.EncryptedData)!,
			Buffer.from("PV-Msg03"),
		);

		const outputKey = hkdfExpand(
			"MediaRemote-Salt",
			"MediaRemote-Write-Encryption-Key",
			this._verifyShared,
		);
		const inputKey = hkdfExpand(
			"MediaRemote-Salt",
			"MediaRemote-Read-Encryption-Key",
			this._verifyShared,
		);
		this.enableEncryption(outputKey, inputKey);

		const resp = new Map<number, Buffer>();
		resp.set(TlvValue.SeqNo, Buffer.from([0x04]));
		return writeTlv(resp);
	}
}

/**
 * Concrete AirPlay server auth for testing (stores encrypted state in-memory).
 */
export class AirPlayServerAuth extends BaseAirPlayServerAuth {
	outputKey: Buffer | null = null;
	inputKey: Buffer | null = null;
	lastSentBody: Buffer | null = null;
	lastSentStatus = 0;

	async sendToClient(
		statusCode: number,
		body: Buffer,
		_headers?: Record<string, string>,
	): Promise<void> {
		this.lastSentStatus = statusCode;
		this.lastSentBody = body;
	}

	enableEncryption(outputKey: Buffer, inputKey: Buffer): void {
		this.outputKey = outputKey;
		this.inputKey = inputKey;
	}
}
