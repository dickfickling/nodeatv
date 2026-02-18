/**
 * Pick authentication type based on device support.
 */

import {
	AuthenticationType,
	type HapCredentials,
	NO_CREDENTIALS,
	type PairSetupProcedure,
	type PairVerifyProcedure,
	parseCredentials,
	TRANSIENT_CREDENTIALS,
} from "../../../auth/hapPairing.js";
import { HAPSession } from "../../../auth/hapSession.js";
import { SRPAuthHandler } from "../../../auth/hapSrp.js";
import { NotSupportedError } from "../../../exceptions.js";
import type { BaseService } from "../../../interface.js";
import type { HttpConnection } from "../../../support/http.js";
import { LegacySRPAuthHandler, newCredentials } from "../srp.js";
import { AirPlayFlags, hasFlag, parseFeatures } from "../utils.js";
import {
	AirPlayHapPairSetupProcedure,
	AirPlayHapPairVerifyProcedure,
} from "./hap.js";
import { AirPlayHapTransientPairVerifyProcedure } from "./hapTransient.js";
import {
	AirPlayLegacyPairSetupProcedure,
	AirPlayLegacyPairVerifyProcedure,
} from "./legacy.js";

const CONTROL_SALT = "Control-Salt";
const CONTROL_OUTPUT_INFO = "Control-Write-Encryption-Key";
const CONTROL_INPUT_INFO = "Control-Read-Encryption-Key";

/**
 * Null implementation for Pair-Verify when no verification is needed.
 */
class NullPairVerifyProcedure implements PairVerifyProcedure {
	async verifyCredentials(): Promise<boolean> {
		return false;
	}

	encryptionKeys(
		_salt: string,
		_outputInfo: string,
		_inputInfo: string,
	): [Buffer, Buffer] {
		throw new NotSupportedError(
			"encryption keys not supported by null implementation",
		);
	}
}

/**
 * Return procedure object used for Pair-Setup.
 */
export function pairSetup(
	authType: AuthenticationType,
	connection: HttpConnection,
): PairSetupProcedure {
	if (authType === AuthenticationType.Legacy) {
		const legacySrp = new LegacySRPAuthHandler(newCredentials());
		legacySrp.initialize();
		return new AirPlayLegacyPairSetupProcedure(connection, legacySrp);
	}
	if (authType === AuthenticationType.HAP) {
		const srp = new SRPAuthHandler();
		srp.initialize();
		return new AirPlayHapPairSetupProcedure(connection, srp);
	}

	throw new NotSupportedError(
		`authentication type ${authType} does not support Pair-Setup`,
	);
}

/**
 * Return procedure object used for Pair-Verify.
 */
export function pairVerify(
	credentials: HapCredentials,
	connection: HttpConnection,
): PairVerifyProcedure {
	if (credentials.type === AuthenticationType.Null) {
		return new NullPairVerifyProcedure();
	}
	if (credentials.type === AuthenticationType.Legacy) {
		const legacySrp = new LegacySRPAuthHandler(credentials);
		legacySrp.initialize();
		return new AirPlayLegacyPairVerifyProcedure(connection, legacySrp);
	}

	const srp = new SRPAuthHandler();
	srp.initialize();
	if (credentials.type === AuthenticationType.HAP) {
		return new AirPlayHapPairVerifyProcedure(connection, srp, credentials);
	}
	return new AirPlayHapTransientPairVerifyProcedure(connection, srp);
}

/**
 * Perform Pair-Verify on a connection and enable encryption.
 */
export async function verifyConnection(
	credentials: HapCredentials,
	connection: HttpConnection,
): Promise<PairVerifyProcedure> {
	const verifier = pairVerify(credentials, connection);
	const hasEncryptionKeys = await verifier.verifyCredentials();

	if (hasEncryptionKeys) {
		const [outputKey, inputKey] = verifier.encryptionKeys(
			CONTROL_SALT,
			CONTROL_OUTPUT_INFO,
			CONTROL_INPUT_INFO,
		);

		const session = new HAPSession();
		session.enable(outputKey, inputKey);
		connection.receiveProcessor = (data: Buffer) => session.decrypt(data);
		connection.sendProcessor = (data: Buffer) => session.encrypt(data);
	}

	return verifier;
}

/**
 * Extract credentials from service based on what's supported.
 */
export function extractCredentials(service: BaseService): HapCredentials {
	if (service.credentials !== null) {
		return parseCredentials(service.credentials);
	}

	const flags = parseFeatures(
		service.properties.features ?? service.properties.ft ?? "0x0",
	);
	if (
		hasFlag(flags, AirPlayFlags.SupportsSystemPairing) ||
		hasFlag(flags, AirPlayFlags.SupportsCoreUtilsPairingAndEncryption)
	) {
		return TRANSIENT_CREDENTIALS;
	}

	return NO_CREDENTIALS;
}

export {
	CONTROL_SALT,
	CONTROL_OUTPUT_INFO,
	CONTROL_INPUT_INFO,
	AuthenticationType,
};
