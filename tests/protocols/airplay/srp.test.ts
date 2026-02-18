import { describe, expect, it } from "vitest";
import { HapCredentials } from "../../../src/auth/hapPairing.js";
import { createSRPContext, SRPServerSession } from "../../../src/auth/srp.js";
import {
	LegacySRPAuthHandler,
	newCredentials,
} from "../../../src/protocols/airplay/srp.js";

describe("LegacySRPAuthHandler", () => {
	it("newCredentials creates valid credentials", () => {
		const creds = newCredentials();
		expect(creds.ltsk.length).toBe(32);
		expect(creds.clientId.length).toBe(8);
	});

	it("step1 initializes SRP session", () => {
		const creds = newCredentials();
		const handler = new LegacySRPAuthHandler(creds);
		handler.initialize();
		expect(() => handler.step1("user123", 1234)).not.toThrow();
	});

	it("step1-step2 round trip with server", () => {
		const creds = newCredentials();
		const handler = new LegacySRPAuthHandler(creds);
		handler.initialize();

		const username = creds.clientId.toString("hex").toUpperCase();
		const pinCode = 1234;
		handler.step1(username, pinCode);

		const serverContext = createSRPContext(username, String(pinCode));
		const server = new SRPServerSession(serverContext);

		const [pubKeyHex, proofHex] = handler.step2(
			server.publicBytes,
			server.saltBytes,
		);

		expect(pubKeyHex).toBeTruthy();
		expect(proofHex).toBeTruthy();

		const verified = server.processAndVerify(pubKeyHex, proofHex);
		expect(verified).toBe(true);
	});

	it("step3 derives AES key and encrypts", () => {
		const creds = newCredentials();
		const handler = new LegacySRPAuthHandler(creds);
		handler.initialize();

		const username = creds.clientId.toString("hex").toUpperCase();
		const pinCode = 1111;
		handler.step1(username, pinCode);

		const serverContext = createSRPContext(username, String(pinCode));
		const server = new SRPServerSession(serverContext);

		handler.step2(server.publicBytes, server.saltBytes);
		server.processAndVerify(
			handler.session!.public,
			handler.session!.keyProofHash,
		);

		const [epk, authTag] = handler.step3();
		expect(epk).toBeInstanceOf(Buffer);
		expect(authTag).toBeInstanceOf(Buffer);
		expect(authTag.length).toBe(16); // GCM auth tag
	});
});
