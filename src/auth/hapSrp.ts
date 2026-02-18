import * as crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { AuthenticationError } from "../exceptions.js";
import { Chacha20Cipher8byteNonce } from "../support/chacha20.js";
import { logBinary } from "../support/utils.js";
import type { HapCredentials } from "./hapPairing.js";
import { HapCredentials as HapCredentialsCtor } from "./hapPairing.js";
import { readTlv, TlvValue, writeTlv } from "./hapTlv8.js";
import { pack as opackPack } from "../support/opack.js";
import { createSRPContext, SRPClientSession } from "./srp.js";

const logger = {
	isEnabledFor: () => false,
	debug: (..._args: unknown[]) => {},
};

export function hkdfExpand(
	salt: string,
	info: string,
	sharedSecret: Buffer,
): Buffer {
	return Buffer.from(
		crypto.hkdfSync(
			"sha512",
			sharedSecret,
			Buffer.from(salt),
			Buffer.from(info),
			32,
		),
	);
}

export class SRPAuthHandler {
	pairingId: Buffer;
	private _signingKey: crypto.KeyObject | null = null;
	private _authPrivate: Buffer | null = null;
	private _authPublic: Buffer | null = null;
	private _verifyPrivate: crypto.KeyObject | null = null;
	private _verifyPublic: crypto.KeyObject | null = null;
	private _publicBytes: Buffer | null = null;
	private _shared: Buffer | null = null;
	private _session: SRPClientSession | null = null;

	constructor() {
		this.pairingId = Buffer.from(randomUUID());
	}

	initialize(): [Buffer, Buffer] {
		const edKeypair = crypto.generateKeyPairSync("ed25519");
		this._signingKey = edKeypair.privateKey;
		this._authPrivate = Buffer.from(
			edKeypair.privateKey
				.export({ type: "pkcs8", format: "der" })
				.subarray(-32),
		);
		this._authPublic = Buffer.from(
			edKeypair.publicKey.export({ type: "spki", format: "der" }).subarray(-32),
		);

		const x25519Keypair = crypto.generateKeyPairSync("x25519");
		this._verifyPrivate = x25519Keypair.privateKey;
		this._verifyPublic = x25519Keypair.publicKey;
		this._publicBytes = Buffer.from(
			x25519Keypair.publicKey
				.export({ type: "spki", format: "der" })
				.subarray(-32),
		);

		return [this._authPublic, this._publicBytes];
	}

	verify1(
		credentials: HapCredentials,
		sessionPubKey: Buffer,
		encrypted: Buffer,
	): Buffer {
		const peerKey = crypto.createPublicKey({
			key: Buffer.concat([
				Buffer.from("302a300506032b656e032100", "hex"),
				sessionPubKey,
			]),
			format: "der",
			type: "spki",
		});

		this._shared = Buffer.from(
			crypto.diffieHellman({
				privateKey: this._verifyPrivate!,
				publicKey: peerKey,
			}),
		);

		const sessionKey = hkdfExpand(
			"Pair-Verify-Encrypt-Salt",
			"Pair-Verify-Encrypt-Info",
			this._shared,
		);

		const chacha = new Chacha20Cipher8byteNonce(sessionKey, sessionKey);
		const decryptedTlv = readTlv(
			chacha.decrypt(encrypted, Buffer.from("PV-Msg02")),
		);

		const identifier = decryptedTlv.get(0x01)!; // TlvValue.Identifier
		const signature = decryptedTlv.get(0x0a)!; // TlvValue.Signature

		if (!identifier.equals(credentials.atvId)) {
			throw new AuthenticationError("incorrect device response");
		}

		const info = Buffer.concat([sessionPubKey, identifier, this._publicBytes!]);
		const ltpk = crypto.createPublicKey({
			key: Buffer.concat([
				Buffer.from("302a300506032b6570032100", "hex"),
				credentials.ltpk,
			]),
			format: "der",
			type: "spki",
		});

		const valid = crypto.verify(null, info, ltpk, signature);
		if (!valid) {
			throw new AuthenticationError("signature error");
		}

		const deviceInfo = Buffer.concat([
			this._publicBytes!,
			credentials.clientId,
			sessionPubKey,
		]);

		const signingKey = crypto.createPrivateKey({
			key: Buffer.concat([
				Buffer.from("302e020100300506032b657004220420", "hex"),
				credentials.ltsk,
			]),
			format: "der",
			type: "pkcs8",
		});
		const deviceSignature = crypto.sign(null, deviceInfo, signingKey);

		const tlv = new Map<number, Buffer>();
		tlv.set(0x01, credentials.clientId); // TlvValue.Identifier
		tlv.set(0x0a, deviceSignature); // TlvValue.Signature

		return chacha.encrypt(writeTlv(tlv), Buffer.from("PV-Msg03"));
	}

	verify2(
		salt: string,
		outputInfo: string,
		inputInfo: string,
	): [Buffer, Buffer] {
		const outputKey = hkdfExpand(salt, outputInfo, this._shared!);
		const inputKey = hkdfExpand(salt, inputInfo, this._shared!);
		logBinary(logger, "Keys", { Output: outputKey, Input: inputKey });
		return [outputKey, inputKey];
	}

	step1(pinCode: number): void {
		const context = createSRPContext(
			"Pair-Setup",
			String(pinCode).padStart(4, "0"),
		);
		this._session = new SRPClientSession(
			context,
			this._authPrivate ?? undefined,
		);
	}

	step2(serverPubKey: Buffer, salt: Buffer): [Buffer, Buffer] {
		if (!this._session) {
			throw new Error("Must call step1() before step2()");
		}
		this._session.process(serverPubKey.toString("hex"), salt.toString("hex"));
		return [
			Buffer.from(this._session.public, "hex"),
			Buffer.from(this._session.keyProofHash, "hex"),
		];
	}

	get sharedKey(): string {
		if (!this._session) {
			throw new Error("SRP session not established");
		}
		return this._session.key;
	}

	step3(name?: string | null, additionalData?: Map<number, Buffer>): Buffer {
		if (!this._session) {
			throw new Error("Must call step1()/step2() before step3()");
		}

		const sessionKey = Buffer.from(this._session.key, "hex");

		const controllerSalt = "Pair-Setup-Controller-Sign-Salt";
		const controllerInfo = "Pair-Setup-Controller-Sign-Info";
		const derivedKey = hkdfExpand(controllerSalt, controllerInfo, sessionKey);

		const deviceInfo = Buffer.concat([
			derivedKey,
			this.pairingId,
			this._authPublic!,
		]);

		const signature = crypto.sign(null, deviceInfo, this._signingKey!);

		const tlv = new Map<number, Buffer>();
		tlv.set(TlvValue.Identifier, this.pairingId);
		tlv.set(TlvValue.PublicKey, this._authPublic!);
		tlv.set(TlvValue.Signature, signature);

		if (name) {
			tlv.set(TlvValue.Name, opackPack({ name }));
		}

		if (additionalData) {
			for (const [k, v] of additionalData) {
				tlv.set(k, v);
			}
		}

		const encryptSalt = "Pair-Setup-Encrypt-Salt";
		const encryptInfo = "Pair-Setup-Encrypt-Info";
		const encryptKey = hkdfExpand(encryptSalt, encryptInfo, sessionKey);

		const chacha = new Chacha20Cipher8byteNonce(encryptKey, encryptKey);
		return chacha.encrypt(writeTlv(tlv), Buffer.from("PS-Msg05"));
	}

	step4(encryptedData: Buffer): HapCredentials {
		if (!this._session) {
			throw new Error("Must call step1()/step2()/step3() before step4()");
		}

		const sessionKey = Buffer.from(this._session.key, "hex");

		const encryptSalt = "Pair-Setup-Encrypt-Salt";
		const encryptInfo = "Pair-Setup-Encrypt-Info";
		const decryptKey = hkdfExpand(encryptSalt, encryptInfo, sessionKey);

		const chacha = new Chacha20Cipher8byteNonce(decryptKey, decryptKey);
		const decrypted = chacha.decrypt(encryptedData, Buffer.from("PS-Msg06"));
		const tlv = readTlv(decrypted);

		const atvId = tlv.get(TlvValue.Identifier)!;
		const ltpk = tlv.get(TlvValue.PublicKey)!;
		const _signature = tlv.get(TlvValue.Signature);

		return new HapCredentialsCtor(
			ltpk,
			this._authPrivate!,
			atvId,
			this.pairingId,
		);
	}
}
