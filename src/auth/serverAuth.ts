/**
 * Shared constants and helpers for server-side authentication.
 * Used for integration testing: simulates an Apple TV's auth server.
 */

import * as crypto from "node:crypto";
import { createSRPContext, SRPServerSession } from "./srp.js";

/** Default PIN code for test pairing */
export const PIN_CODE = 1111;

/** Default client identifier for testing */
export const CLIENT_IDENTIFIER = "default_client_id";

/** Default client credentials string for testing */
export const CLIENT_CREDENTIALS =
	"0000000000000000000000000000000000000000000000000000000000000000:" +
	"0000000000000000000000000000000000000000000000000000000000000001:" +
	"00000000000000000000000000000000:" +
	"00000000000000000000000000000001";

/** Default server identifier for testing */
export const SERVER_IDENTIFIER = "default_server_id";

/** Default private key seed for deterministic tests */
export const PRIVATE_KEY = crypto.randomBytes(32);

export interface ServerKeys {
	signingKey: crypto.KeyObject;
	publicKey: Buffer;
	privateKeyRaw: Buffer;
}

/**
 * Generate Ed25519 server keys from a seed.
 */
export function generateKeys(seed?: Buffer): ServerKeys {
	const actualSeed = seed ?? crypto.randomBytes(32);
	const signingKey = crypto.createPrivateKey({
		key: Buffer.concat([
			Buffer.from("302e020100300506032b657004220420", "hex"),
			actualSeed,
		]),
		format: "der",
		type: "pkcs8",
	});
	const publicKey = Buffer.from(
		crypto
			.createPublicKey(signingKey)
			.export({ type: "spki", format: "der" })
			.subarray(-32),
	);
	return { signingKey, publicKey, privateKeyRaw: actualSeed };
}

/**
 * Create a new SRP server session for pairing.
 */
export function newServerSession(pin: number = PIN_CODE): SRPServerSession {
	const context = createSRPContext("Pair-Setup", String(pin).padStart(4, "0"));
	return new SRPServerSession(context);
}
