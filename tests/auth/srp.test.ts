import { describe, expect, it } from "vitest";
import {
	createSRPContext,
	SRPClientSession,
	SRPServerSession,
} from "../../src/auth/srp.js";

describe("SRP6a", () => {
	const username = "Pair-Setup";
	const password = "1111";

	it("client-server round-trip with known PIN", () => {
		const context = createSRPContext(username, password);

		const server = new SRPServerSession(context);
		const client = new SRPClientSession(context);

		// Client processes server's public key and salt
		client.process(server.public, server.salt);

		// Server verifies client's proof
		const verified = server.processAndVerify(
			client.public,
			client.keyProofHash,
		);
		expect(verified).toBe(true);

		// Client verifies server's proof
		expect(client.verifyProof(server.keyProofHash)).toBe(true);

		// Both derive same session key
		expect(client.key).toBe(server.key);
	});

	it("rejects wrong PIN", () => {
		const serverContext = createSRPContext(username, password);
		const clientContext = createSRPContext(username, "9999");

		const server = new SRPServerSession(serverContext);
		const client = new SRPClientSession(clientContext);

		client.process(server.public, server.salt);

		const verified = server.processAndVerify(
			client.public,
			client.keyProofHash,
		);
		expect(verified).toBe(false);
	});

	it("key is accessible as hex and bytes", () => {
		const context = createSRPContext(username, password);
		const server = new SRPServerSession(context);
		const client = new SRPClientSession(context);

		client.process(server.public, server.salt);
		server.processAndVerify(client.public, client.keyProofHash);

		expect(client.keyBytes).toBeInstanceOf(Buffer);
		expect(client.keyBytes.length).toBe(64); // SHA-512 output
		expect(client.keyBytes.toString("hex")).toBe(client.key);

		expect(server.keyBytes).toBeInstanceOf(Buffer);
		expect(server.keyBytes.toString("hex")).toBe(server.key);
	});

	it("public key is available before processing", () => {
		const context = createSRPContext(username, password);
		const client = new SRPClientSession(context);
		expect(client.public).toBeTruthy();
		expect(typeof client.public).toBe("string");
	});

	it("throws if key accessed before process", () => {
		const context = createSRPContext(username, password);
		const client = new SRPClientSession(context);
		expect(() => client.key).toThrow("not processed yet");
	});

	it("throws if verifyProof called before process", () => {
		const context = createSRPContext(username, password);
		const client = new SRPClientSession(context);
		expect(() => client.verifyProof("abc")).toThrow("Must call process()");
	});

	it("server salt and public key are buffers", () => {
		const context = createSRPContext(username, password);
		const server = new SRPServerSession(context);
		expect(server.saltBytes).toBeInstanceOf(Buffer);
		expect(server.publicBytes).toBeInstanceOf(Buffer);
	});

	it("accepts custom private key for client", () => {
		const context = createSRPContext(username, password);
		const privateKey = Buffer.alloc(32, 0x42);
		const client = new SRPClientSession(context, privateKey);
		expect(client.public).toBeTruthy();
	});

	it("multiple round-trips produce different keys", () => {
		const context = createSRPContext(username, password);

		const server1 = new SRPServerSession(context);
		const client1 = new SRPClientSession(context);
		client1.process(server1.public, server1.salt);
		server1.processAndVerify(client1.public, client1.keyProofHash);

		const server2 = new SRPServerSession(context);
		const client2 = new SRPClientSession(context);
		client2.process(server2.public, server2.salt);
		server2.processAndVerify(client2.public, client2.keyProofHash);

		// Different salts → different keys
		expect(client1.key).not.toBe(client2.key);
	});
});
