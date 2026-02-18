/**
 * Implementation of SRP used by AirPlay device authentication.
 *
 * NOTE: Full SRP functionality requires the srptools library equivalent.
 * This module provides the key exchange and verification primitives.
 */

import * as crypto from "node:crypto";
import type { HapCredentials } from "../../auth/hapPairing.js";
import { HapCredentials as HapCredentialsCtor } from "../../auth/hapPairing.js";
import { createSRPContext, SRPClientSession } from "../../auth/srp.js";
import { logBinary } from "../../support/utils.js";

const _logger = {
	isEnabledFor: () => false,
	debug: (..._args: unknown[]) => {},
};

/**
 * Create SHA512 hash for input arguments.
 */
export function hashSha512(...indata: (string | Buffer)[]): Buffer {
	const hasher = crypto.createHash("sha512");
	for (const data of indata) {
		if (typeof data === "string") {
			hasher.update(data, "utf-8");
		} else if (Buffer.isBuffer(data)) {
			hasher.update(data);
		} else {
			throw new TypeError(`Invalid input data: ${data}`);
		}
	}
	return hasher.digest();
}

/**
 * Encrypt data with AES in specified mode.
 */
export function aesEncrypt(
	mode: "ctr" | "gcm",
	aesKey: Buffer,
	aesIv: Buffer,
	...data: Buffer[]
): [Buffer, Buffer | null] {
	let cipher:
		| crypto.CipherGCM
		| crypto.CipherCCM
		| ReturnType<typeof crypto.createCipheriv>;
	if (mode === "gcm") {
		cipher = crypto.createCipheriv(
			"aes-128-gcm",
			aesKey,
			aesIv,
		) as crypto.CipherGCM;
	} else {
		cipher = crypto.createCipheriv("aes-128-ctr", aesKey, aesIv);
	}

	let result: Buffer = Buffer.alloc(0);
	for (const value of data) {
		result = Buffer.from(cipher.update(value));
	}
	cipher.final();

	const tag = mode === "gcm" ? (cipher as crypto.CipherGCM).getAuthTag() : null;

	return [result, tag];
}

/**
 * Generate a new identifier and seed for authentication.
 */
export function newCredentials(): HapCredentials {
	return new HapCredentialsCtor(
		Buffer.alloc(0),
		crypto.randomBytes(32),
		Buffer.alloc(0),
		crypto.randomBytes(8),
	);
}

/**
 * Handle SRP data and crypto routines for legacy auth and verification.
 */
export class LegacySRPAuthHandler {
	credentials: HapCredentials;
	session: SRPClientSession | null = null;
	private _publicBytes: Buffer | null = null;
	private _authPrivate: Buffer | null = null;
	private _authPublic: Buffer | null = null;
	private _verifyPrivate: crypto.KeyObject | null = null;
	private _verifyPublic: crypto.KeyObject | null = null;

	constructor(credentials: HapCredentials) {
		this.credentials = credentials;
	}

	initialize(): void {
		const signingKey = crypto.createPrivateKey({
			key: Buffer.concat([
				Buffer.from("302e020100300506032b657004220420", "hex"),
				this.credentials.ltsk,
			]),
			format: "der",
			type: "pkcs8",
		});
		const verifyingKey = crypto.createPublicKey(signingKey);

		this._authPrivate = Buffer.from(
			signingKey.export({ type: "pkcs8", format: "der" }).subarray(-32),
		);
		this._authPublic = Buffer.from(
			verifyingKey.export({ type: "spki", format: "der" }).subarray(-32),
		);

		logBinary(_logger, "Authentication keys", {
			Private: this._authPrivate,
			Public: this._authPublic,
		});
	}

	/**
	 * First device verification step.
	 */
	verify1(): Buffer {
		this._verifyPrivate = crypto.createPrivateKey({
			key: Buffer.concat([
				Buffer.from("302e020100300506032b656e04220420", "hex"),
				this.credentials.ltsk,
			]),
			format: "der",
			type: "pkcs8",
		});
		this._verifyPublic = crypto.createPublicKey(this._verifyPrivate);

		this._publicBytes = Buffer.from(
			this._verifyPublic.export({ type: "spki", format: "der" }).subarray(-32),
		);

		logBinary(_logger, "Verification keys", {
			Public: this._publicBytes,
		});

		return Buffer.concat([
			Buffer.from([0x01, 0x00, 0x00, 0x00]),
			this._publicBytes,
			this._authPublic!,
		]);
	}

	/**
	 * Last device verification step.
	 */
	verify2(atvPublicKey: Buffer, data: Buffer): Buffer {
		logBinary(_logger, "Verify", {
			PublicSecret: atvPublicKey,
			Data: data,
		});

		// Generate a shared secret key
		const peerKey = crypto.createPublicKey({
			key: Buffer.concat([
				Buffer.from("302a300506032b656e032100", "hex"),
				atvPublicKey,
			]),
			format: "der",
			type: "spki",
		});

		const shared = Buffer.from(
			crypto.diffieHellman({
				privateKey: this._verifyPrivate!,
				publicKey: peerKey,
			}),
		);
		logBinary(_logger, "Shared secret", { Secret: shared });

		// Derive new AES key and IV from shared key
		const aesKey = hashSha512("Pair-Verify-AES-Key", shared).subarray(0, 16);
		const aesIv = hashSha512("Pair-Verify-AES-IV", shared).subarray(0, 16);
		logBinary(_logger, "Pair-Verify-AES", { Key: aesKey, IV: aesIv });

		// Sign public keys and encrypt with AES
		const signer = crypto.createPrivateKey({
			key: Buffer.concat([
				Buffer.from("302e020100300506032b657004220420", "hex"),
				this._authPrivate!,
			]),
			format: "der",
			type: "pkcs8",
		});

		const signed = crypto.sign(
			null,
			Buffer.concat([this._publicBytes!, atvPublicKey]),
			signer,
		);
		const [signature] = aesEncrypt("ctr", aesKey, aesIv, data, signed);
		logBinary(_logger, "Signature", { Signature: signature });

		return Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x00]), signature]);
	}

	/**
	 * First authentication step.
	 */
	step1(username: string, password: number): void {
		const context = createSRPContext(username, String(password));
		this.session = new SRPClientSession(context);
	}

	/**
	 * Second authentication step.
	 */
	step2(pubKey: Buffer, salt: Buffer): [string, string] {
		if (!this.session) {
			throw new Error("Must call step1() before step2()");
		}
		this.session.process(pubKey.toString("hex"), salt.toString("hex"));
		return [this.session.public, this.session.keyProofHash];
	}

	/**
	 * Last authentication step.
	 */
	step3(): [Buffer, Buffer] {
		if (!this.session) {
			throw new Error("Must call step1()/step2() before step3()");
		}
		const sessionKey = Buffer.from(this.session.key, "hex");
		const aesKey = hashSha512("Pair-Setup-AES-Key", sessionKey).subarray(0, 16);
		const aesIv = hashSha512("Pair-Setup-AES-IV", sessionKey).subarray(0, 16);
		// Increment last byte of IV by 1, matching pyatv behavior
		aesIv[aesIv.length - 1] = (aesIv[aesIv.length - 1] + 1) & 0xff;

		const [epk, authTag] = aesEncrypt("gcm", aesKey, aesIv, this._authPublic!);
		return [epk, authTag!];
	}
}
