import * as crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { hkdfExpand, SRPAuthHandler } from "../../src/auth/hapSrp.js";
import { readTlv, TlvValue, writeTlv } from "../../src/auth/hapTlv8.js";
import { createSRPContext, SRPServerSession } from "../../src/auth/srp.js";
import { Chacha20Cipher8byteNonce } from "../../src/support/chacha20.js";

describe("SRPAuthHandler", () => {
	it("initialize creates key pairs", () => {
		const handler = new SRPAuthHandler();
		const [authPub, verifyPub] = handler.initialize();
		expect(authPub).toBeInstanceOf(Buffer);
		expect(authPub.length).toBe(32);
		expect(verifyPub).toBeInstanceOf(Buffer);
		expect(verifyPub.length).toBe(32);
	});

	it("step1 initializes SRP session", () => {
		const handler = new SRPAuthHandler();
		handler.initialize();
		expect(() => handler.step1(1111)).not.toThrow();
	});

	it("step1 then step2 computes keys", () => {
		const handler = new SRPAuthHandler();
		handler.initialize();
		handler.step1(1111);

		// Create a server session to get pubkey and salt
		const context = createSRPContext("Pair-Setup", "1111");
		const server = new SRPServerSession(context);

		const [pubKey, proof] = handler.step2(server.publicBytes, server.saltBytes);

		expect(pubKey).toBeInstanceOf(Buffer);
		expect(pubKey.length).toBeGreaterThan(0);
		expect(proof).toBeInstanceOf(Buffer);
		expect(proof.length).toBeGreaterThan(0);
	});

	it("sharedKey accessible after step2", () => {
		const handler = new SRPAuthHandler();
		handler.initialize();
		handler.step1(1111);

		const context = createSRPContext("Pair-Setup", "1111");
		const server = new SRPServerSession(context);

		handler.step2(server.publicBytes, server.saltBytes);

		expect(handler.sharedKey).toBeTruthy();
		expect(typeof handler.sharedKey).toBe("string");
	});

	it("sharedKey throws before step2", () => {
		const handler = new SRPAuthHandler();
		expect(() => handler.sharedKey).toThrow();
	});

	describe("full step1-step4 flow", () => {
		it("completes pair setup with server", () => {
			const pinCode = 1111;
			const handler = new SRPAuthHandler();
			handler.initialize();

			// Step 1: client initiates
			handler.step1(pinCode);

			// Server side: create server session
			const serverContext = createSRPContext("Pair-Setup", String(pinCode));
			const server = new SRPServerSession(serverContext);

			// Step 2: client processes server pub key + salt
			const [clientPubKey, clientProof] = handler.step2(
				server.publicBytes,
				server.saltBytes,
			);

			// Server verifies client
			const verified = server.processAndVerify(
				clientPubKey.toString("hex"),
				clientProof.toString("hex"),
			);
			expect(verified).toBe(true);

			// Step 3: client sends encrypted device info
			const encryptedDeviceInfo = handler.step3();
			expect(encryptedDeviceInfo).toBeInstanceOf(Buffer);
			expect(encryptedDeviceInfo.length).toBeGreaterThan(0);

			// Server decrypts step3 and responds with step4
			const sessionKey = server.keyBytes;
			const decryptKey = hkdfExpand(
				"Pair-Setup-Encrypt-Salt",
				"Pair-Setup-Encrypt-Info",
				sessionKey,
			);
			const chacha = new Chacha20Cipher8byteNonce(decryptKey, decryptKey);
			const decrypted = chacha.decrypt(
				encryptedDeviceInfo,
				Buffer.from("PS-Msg05"),
			);
			const tlvData = readTlv(decrypted);

			expect(tlvData.has(TlvValue.Identifier)).toBe(true);
			expect(tlvData.has(TlvValue.PublicKey)).toBe(true);
			expect(tlvData.has(TlvValue.Signature)).toBe(true);

			// Server creates response for step4
			const serverEdKeypair = crypto.generateKeyPairSync("ed25519");
			const serverPubKey = Buffer.from(
				serverEdKeypair.publicKey
					.export({ type: "spki", format: "der" })
					.subarray(-32),
			);
			const serverId = Buffer.from("server-test-id");

			const serverSignKey = hkdfExpand(
				"Pair-Setup-Accessory-Sign-Salt",
				"Pair-Setup-Accessory-Sign-Info",
				sessionKey,
			);
			const serverInfo = Buffer.concat([serverSignKey, serverId, serverPubKey]);
			const serverSignature = crypto.sign(
				null,
				serverInfo,
				serverEdKeypair.privateKey,
			);

			const responseTlv = new Map<number, Buffer>();
			responseTlv.set(TlvValue.Identifier, serverId);
			responseTlv.set(TlvValue.PublicKey, serverPubKey);
			responseTlv.set(TlvValue.Signature, serverSignature);

			const chacha2 = new Chacha20Cipher8byteNonce(decryptKey, decryptKey);
			const encryptedResponse = chacha2.encrypt(
				writeTlv(responseTlv),
				Buffer.from("PS-Msg06"),
			);

			// Step 4: client processes server response
			const credentials = handler.step4(encryptedResponse);
			expect(credentials).toBeTruthy();
			expect(credentials.ltpk).toEqual(serverPubKey);
			expect(credentials.atvId).toEqual(serverId);
		});
	});
});
