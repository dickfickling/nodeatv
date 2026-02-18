/**
 * Device pairing and derivation of encryption keys.
 */

import type {
	HapCredentials,
	PairSetupProcedure,
	PairVerifyProcedure,
} from "../../auth/hapPairing.js";
import type { SRPAuthHandler } from "../../auth/hapSrp.js";
import {
	readTlv,
	stringify,
	type TlvValue,
	writeTlv,
} from "../../auth/hapTlv8.js";
import { AuthenticationError, ProtocolError } from "../../exceptions.js";
import { FrameType } from "./connection.js";
import type { CompanionProtocol } from "./protocol.js";

const PAIRING_DATA_KEY = "_pd";

const TlvMethod = 0x00 as TlvValue;
const _TlvIdentifier = 0x01 as TlvValue;
const TlvSalt = 0x02 as TlvValue;
const TlvPublicKey = 0x03 as TlvValue;
const TlvProof = 0x04 as TlvValue;
const TlvEncryptedData = 0x05 as TlvValue;
const TlvSeqNo = 0x06 as TlvValue;
const TlvError = 0x07 as TlvValue;

function getPairingData(message: Record<string, unknown>): Map<number, Buffer> {
	const pairingData = message[PAIRING_DATA_KEY];
	if (!pairingData) {
		throw new AuthenticationError("no pairing data in message");
	}

	if (!Buffer.isBuffer(pairingData)) {
		throw new ProtocolError(
			`Pairing data has unexpected type: ${typeof pairingData}`,
		);
	}

	const tlv = readTlv(pairingData);
	if (tlv.has(TlvError)) {
		throw new AuthenticationError(stringify(tlv));
	}

	return tlv;
}

export class CompanionPairSetupProcedure implements PairSetupProcedure {
	private protocol: CompanionProtocol;
	private srp: SRPAuthHandler;
	private _atvSalt: Buffer | null = null;
	private _atvPubKey: Buffer | null = null;

	constructor(protocol: CompanionProtocol, srp: SRPAuthHandler) {
		this.protocol = protocol;
		this.srp = srp;
	}

	async startPairing(): Promise<void> {
		this.srp.initialize();
		await this.protocol.start();

		const tlvData = new Map<number, Buffer>();
		tlvData.set(TlvMethod, Buffer.from([0x00]));
		tlvData.set(TlvSeqNo, Buffer.from([0x01]));

		console.log("[DEBUG] M1: Sending PS_Start");
		const resp = await this.protocol.exchangeAuth(FrameType.PS_Start, {
			[PAIRING_DATA_KEY]: writeTlv(tlvData),
			_pwTy: 1,
		});

		const pairingData = getPairingData(resp);
		this._atvSalt = pairingData.get(TlvSalt) ?? null;
		this._atvPubKey = pairingData.get(TlvPublicKey) ?? null;
		console.log("[DEBUG] M2: Received salt (%d bytes): %s", this._atvSalt?.length, this._atvSalt?.toString("hex").slice(0, 32) + "...");
		console.log("[DEBUG] M2: Received server pubkey (%d bytes): %s...", this._atvPubKey?.length, this._atvPubKey?.toString("hex").slice(0, 32));
	}

	async finishPairing(
		_username: string,
		pinCode: number,
		displayName?: string | null,
	): Promise<HapCredentials> {
		console.log("[DEBUG] M3: PIN code = %d, password = '%s'", pinCode, String(pinCode).padStart(4, "0"));
		this.srp.step1(pinCode);

		const [pubKey, proof] = this.srp.step2(this._atvPubKey!, this._atvSalt!);
		console.log("[DEBUG] M3: Client pubkey (%d bytes): %s...", pubKey.length, pubKey.toString("hex").slice(0, 32));
		console.log("[DEBUG] M3: Client proof (%d bytes): %s", proof.length, proof.toString("hex"));

		const step3Tlv = new Map<number, Buffer>();
		step3Tlv.set(TlvSeqNo, Buffer.from([0x03]));
		step3Tlv.set(TlvPublicKey, pubKey);
		step3Tlv.set(TlvProof, proof);

		const tlvBytes = writeTlv(step3Tlv);
		console.log("[DEBUG] M3: TLV bytes (%d bytes): %s...%s", tlvBytes.length, tlvBytes.toString("hex").slice(0, 40), tlvBytes.toString("hex").slice(-40));

		const resp = await this.protocol.exchangeAuth(FrameType.PS_Next, {
			[PAIRING_DATA_KEY]: tlvBytes,
			_pwTy: 1,
		});

		const pairingData = getPairingData(resp);
		const _atvProof = pairingData.get(TlvProof);

		const encryptedData = this.srp.step3(displayName);

		const step5Tlv = new Map<number, Buffer>();
		step5Tlv.set(TlvSeqNo, Buffer.from([0x05]));
		step5Tlv.set(TlvEncryptedData, encryptedData);

		const resp2 = await this.protocol.exchangeAuth(FrameType.PS_Next, {
			[PAIRING_DATA_KEY]: writeTlv(step5Tlv),
			_pwTy: 1,
		});

		const pairingData2 = getPairingData(resp2);
		const encryptedResp = pairingData2.get(TlvEncryptedData)!;

		return this.srp.step4(encryptedResp);
	}
}

export class CompanionPairVerifyProcedure implements PairVerifyProcedure {
	private protocol: CompanionProtocol;
	private srp: SRPAuthHandler;
	private credentials: HapCredentials;

	constructor(
		protocol: CompanionProtocol,
		srp: SRPAuthHandler,
		credentials: HapCredentials,
	) {
		this.protocol = protocol;
		this.srp = srp;
		this.credentials = credentials;
	}

	async verifyCredentials(): Promise<boolean> {
		const [, publicKey] = this.srp.initialize();

		const step1Tlv = new Map<number, Buffer>();
		step1Tlv.set(TlvSeqNo, Buffer.from([0x01]));
		step1Tlv.set(TlvPublicKey, publicKey);

		const resp = await this.protocol.exchangeAuth(FrameType.PV_Start, {
			[PAIRING_DATA_KEY]: writeTlv(step1Tlv),
			_auTy: 4,
		});

		const pairingData = getPairingData(resp);
		const serverPubKey = pairingData.get(TlvPublicKey)!;
		const encrypted = pairingData.get(TlvEncryptedData)!;

		const encryptedData = this.srp.verify1(
			this.credentials,
			serverPubKey,
			encrypted,
		);

		const step3Tlv = new Map<number, Buffer>();
		step3Tlv.set(TlvSeqNo, Buffer.from([0x03]));
		step3Tlv.set(TlvEncryptedData, encryptedData);

		await this.protocol.exchangeAuth(FrameType.PV_Next, {
			[PAIRING_DATA_KEY]: writeTlv(step3Tlv),
		});

		return true;
	}

	encryptionKeys(
		salt: string,
		outputInfo: string,
		inputInfo: string,
	): [Buffer, Buffer] {
		return this.srp.verify2(salt, outputInfo, inputInfo);
	}
}
