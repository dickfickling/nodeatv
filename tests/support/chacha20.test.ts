import { describe, expect, it } from "vitest";
import {
	Chacha20Cipher,
	Chacha20Cipher8byteNonce,
	NONCE_LENGTH,
} from "../../src/support/chacha20.js";

const fakeKey = Buffer.alloc(32, 0x6b); // 'k' * 32

describe("Chacha20Cipher", () => {
	it("encrypts and decrypts with 12-byte nonce", () => {
		const cipher = new Chacha20Cipher(fakeKey, fakeKey, 12);
		expect(cipher.outNonce.length).toBe(NONCE_LENGTH);
		expect(cipher.inNonce.length).toBe(NONCE_LENGTH);
		const result = cipher.encrypt(Buffer.from("test"));
		expect(cipher.decrypt(result)).toEqual(Buffer.from("test"));
	});

	it("encrypts and decrypts with 8-byte nonce", () => {
		const cipher = new Chacha20Cipher8byteNonce(fakeKey, fakeKey);
		expect(cipher.outNonce.length).toBe(NONCE_LENGTH);
		expect(cipher.inNonce.length).toBe(NONCE_LENGTH);
		const result = cipher.encrypt(Buffer.from("test"));
		expect(cipher.decrypt(result)).toEqual(Buffer.from("test"));
	});
});
