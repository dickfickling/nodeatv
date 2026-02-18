/**
 * Support for HAP transient pairing.
 *
 * Technically, transient pairing only covers the first four states of regular pairing
 * (M1-M4). The shared secret is then used to derive keys. The way this is structured
 * makes it easier to implement as the verification procedure step instead.
 */

import type { PairVerifyProcedure } from "../../../auth/hapPairing.js";
import { hkdfExpand, type SRPAuthHandler } from "../../../auth/hapSrp.js";
import * as hapTlv8 from "../../../auth/hapTlv8.js";
import { InvalidResponseError } from "../../../exceptions.js";
import type { HttpConnection } from "../../../support/http.js";
import { logBinary } from "../../../support/utils.js";

const AIRPLAY_HEADERS: Record<string, string> = {
	"User-Agent": "AirPlay/320.20",
	Connection: "keep-alive",
	"X-Apple-HKP": "4",
	"Content-Type": "application/octet-stream",
};

const TRANSIENT_PIN = 3939;

const _logger = {
	isEnabledFor: () => false,
	debug: (..._args: unknown[]) => {},
};

/**
 * Verify if a device is allowed to perform AirPlay playback via transient HAP.
 */
export class AirPlayHapTransientPairVerifyProcedure
	implements PairVerifyProcedure
{
	private http: HttpConnection;
	private srp: SRPAuthHandler;

	constructor(http: HttpConnection, authHandler: SRPAuthHandler) {
		this.http = http;
		this.srp = authHandler;
	}

	async verifyCredentials(): Promise<boolean> {
		this.srp.initialize();

		await this.http.post("/pair-pin-start", { headers: AIRPLAY_HEADERS });

		const data1 = new Map<number, Buffer>();
		data1.set(hapTlv8.TlvValue.Method, Buffer.from([0x00]));
		data1.set(hapTlv8.TlvValue.SeqNo, Buffer.from([0x01]));
		data1.set(
			hapTlv8.TlvValue.Flags,
			Buffer.from([hapTlv8.Flags.TransientPairing]),
		);
		const resp = await this.http.post("/pair-setup", {
			body: hapTlv8.writeTlv(data1),
			headers: AIRPLAY_HEADERS,
		});

		if (!Buffer.isBuffer(resp.body)) {
			throw new InvalidResponseError(`got unexpected response: ${resp.body}`);
		}

		const pairingData = hapTlv8.readTlv(resp.body);

		const atvSalt = pairingData.get(hapTlv8.TlvValue.Salt)!;
		const atvPubKey = pairingData.get(hapTlv8.TlvValue.PublicKey)!;

		this.srp.step1(TRANSIENT_PIN);

		const [pubKey, proof] = this.srp.step2(atvPubKey, atvSalt);
		const data2 = new Map<number, Buffer>();
		data2.set(hapTlv8.TlvValue.SeqNo, Buffer.from([0x03]));
		data2.set(hapTlv8.TlvValue.PublicKey, pubKey);
		data2.set(hapTlv8.TlvValue.Proof, proof);
		await this.http.post("/pair-setup", {
			body: hapTlv8.writeTlv(data2),
			headers: AIRPLAY_HEADERS,
		});

		return true;
	}

	encryptionKeys(
		salt: string,
		outputInfo: string,
		inputInfo: string,
	): [Buffer, Buffer] {
		const shared = Buffer.from(
			(this.srp as unknown as { _shared: Buffer })._shared,
		);
		const outputKey = hkdfExpand(salt, outputInfo, shared);
		const inputKey = hkdfExpand(salt, inputInfo, shared);
		logBinary(_logger, "Keys", { Output: outputKey, Input: inputKey });
		return [outputKey, inputKey];
	}
}

export { TRANSIENT_PIN };
