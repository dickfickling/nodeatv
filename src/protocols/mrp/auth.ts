/**
 * Device pairing and derivation of encryption keys for MRP protocol.
 */

import {
	type HapCredentials,
	PairSetupProcedure,
	PairVerifyProcedure,
} from "../../auth/hapPairing.js";
import type { SRPAuthHandler } from "../../auth/hapSrp.js";
import { readTlv, stringify, TlvValue, writeTlv } from "../../auth/hapTlv8.js";
import { AuthenticationError } from "../../exceptions.js";
import * as messages from "./messages.js";
import type { ProtocolMessageObj } from "./protobuf/index.js";
import type { MrpProtocol } from "./protocol.js";

function _getPairingData(resp: ProtocolMessageObj): Map<number, Buffer> {
	const inner = resp.cryptoPairingMessage as
		| Record<string, unknown>
		| undefined;
	if (!inner) {
		throw new AuthenticationError("no crypto pairing message in response");
	}
	const pairingData = inner.pairingData;
	if (!pairingData || !Buffer.isBuffer(pairingData)) {
		throw new AuthenticationError("no pairing data in response");
	}
	const tlv = readTlv(pairingData);
	if (tlv.has(TlvValue.Error)) {
		throw new AuthenticationError(stringify(tlv));
	}
	return tlv;
}

/**
 * Perform SRP pair setup over CRYPTO_PAIRING_MESSAGE.
 */
export class MrpPairSetupProcedure extends PairSetupProcedure {
	private protocol: MrpProtocol;
	private srp: SRPAuthHandler;
	private _atvSalt: Buffer | null = null;
	private _atvPubKey: Buffer | null = null;

	constructor(protocol: MrpProtocol, srp: SRPAuthHandler) {
		super();
		this.protocol = protocol;
		this.srp = srp;
	}

	async startPairing(): Promise<void> {
		this.srp.initialize();

		await this.protocol.start(true);

		const tlvData = new Map<number, Buffer>();
		tlvData.set(TlvValue.Method, Buffer.from([0x00]));
		tlvData.set(TlvValue.SeqNo, Buffer.from([0x01]));

		const msg = messages.cryptoPairing(tlvData, true);
		const resp = await this.protocol.sendAndReceive(msg, false);

		const pairingData = _getPairingData(resp);
		this._atvSalt = pairingData.get(TlvValue.Salt) ?? null;
		this._atvPubKey = pairingData.get(TlvValue.PublicKey) ?? null;
	}

	async finishPairing(
		_username: string,
		pinCode: number,
		displayName?: string | null,
	): Promise<HapCredentials> {
		this.srp.step1(pinCode);

		const [pubKey, proof] = this.srp.step2(this._atvPubKey!, this._atvSalt!);

		const step3Tlv = new Map<number, Buffer>();
		step3Tlv.set(TlvValue.SeqNo, Buffer.from([0x03]));
		step3Tlv.set(TlvValue.PublicKey, pubKey);
		step3Tlv.set(TlvValue.Proof, proof);

		const msg3 = messages.cryptoPairing(step3Tlv);
		const resp3 = await this.protocol.sendAndReceive(msg3, false);
		_getPairingData(resp3); // Validates server proof response

		const encryptedData = this.srp.step3(displayName);

		const step5Tlv = new Map<number, Buffer>();
		step5Tlv.set(TlvValue.SeqNo, Buffer.from([0x05]));
		step5Tlv.set(TlvValue.EncryptedData, encryptedData);

		const msg5 = messages.cryptoPairing(step5Tlv);
		const resp5 = await this.protocol.sendAndReceive(msg5, false);

		const pairingData = _getPairingData(resp5);
		const encryptedResp = pairingData.get(TlvValue.EncryptedData)!;
		return this.srp.step4(encryptedResp);
	}
}

/**
 * Verify credentials and derive encryption keys over CRYPTO_PAIRING_MESSAGE.
 */
export class MrpPairVerifyProcedure extends PairVerifyProcedure {
	private protocol: MrpProtocol;
	private srp: SRPAuthHandler;
	private credentials: HapCredentials;

	constructor(
		protocol: MrpProtocol,
		srp: SRPAuthHandler,
		credentials: HapCredentials,
	) {
		super();
		this.protocol = protocol;
		this.srp = srp;
		this.credentials = credentials;
	}

	async verifyCredentials(): Promise<boolean> {
		const [, publicKey] = this.srp.initialize();

		const tlvData1 = new Map<number, Buffer>();
		tlvData1.set(TlvValue.SeqNo, Buffer.from([0x01]));
		tlvData1.set(TlvValue.PublicKey, publicKey);

		const msg1 = messages.cryptoPairing(tlvData1);
		const resp1 = await this.protocol.sendAndReceive(msg1, false);

		const pairingData = _getPairingData(resp1);
		const sessionPubKey = pairingData.get(TlvValue.PublicKey)!;
		const encrypted = pairingData.get(TlvValue.EncryptedData)!;

		const encryptedData = this.srp.verify1(
			this.credentials,
			sessionPubKey,
			encrypted,
		);

		const tlvData2 = new Map<number, Buffer>();
		tlvData2.set(TlvValue.SeqNo, Buffer.from([0x03]));
		tlvData2.set(TlvValue.EncryptedData, encryptedData);

		const msg2 = messages.cryptoPairing(tlvData2);
		await this.protocol.sendAndReceive(msg2, false);

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
