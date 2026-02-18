import { describe, expect, it } from "vitest";
import {
	CLIENT_CREDENTIALS,
	CLIENT_IDENTIFIER,
	generateKeys,
	newServerSession,
	PIN_CODE,
	PRIVATE_KEY,
	SERVER_IDENTIFIER,
} from "../../src/auth/serverAuth.js";

describe("serverAuth constants", () => {
	it("exports PIN_CODE", () => {
		expect(PIN_CODE).toBe(1111);
	});

	it("exports CLIENT_IDENTIFIER", () => {
		expect(typeof CLIENT_IDENTIFIER).toBe("string");
	});

	it("exports CLIENT_CREDENTIALS", () => {
		expect(typeof CLIENT_CREDENTIALS).toBe("string");
		expect(CLIENT_CREDENTIALS.split(":").length).toBe(4);
	});

	it("exports SERVER_IDENTIFIER", () => {
		expect(typeof SERVER_IDENTIFIER).toBe("string");
	});

	it("exports PRIVATE_KEY", () => {
		expect(PRIVATE_KEY).toBeInstanceOf(Buffer);
		expect(PRIVATE_KEY.length).toBe(32);
	});
});

describe("generateKeys", () => {
	it("generates Ed25519 keys", () => {
		const keys = generateKeys();
		expect(keys.publicKey).toBeInstanceOf(Buffer);
		expect(keys.publicKey.length).toBe(32);
		expect(keys.privateKeyRaw).toBeInstanceOf(Buffer);
		expect(keys.privateKeyRaw.length).toBe(32);
	});

	it("produces deterministic keys from seed", () => {
		const seed = Buffer.alloc(32, 0x42);
		const keys1 = generateKeys(seed);
		const keys2 = generateKeys(seed);
		expect(keys1.publicKey.equals(keys2.publicKey)).toBe(true);
	});
});

describe("newServerSession", () => {
	it("creates SRP server session", () => {
		const session = newServerSession();
		expect(session.public).toBeTruthy();
		expect(session.salt).toBeTruthy();
	});

	it("accepts custom PIN", () => {
		const session = newServerSession(9999);
		expect(session.public).toBeTruthy();
	});
});
