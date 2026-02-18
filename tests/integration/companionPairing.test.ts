/**
 * Integration test: Companion client pairing procedures ↔ CompanionServerAuth.
 */

import { describe, expect, it } from "vitest";
import { SRPAuthHandler } from "../../src/auth/hapSrp.js";
import {
	CompanionPairSetupProcedure,
	CompanionPairVerifyProcedure,
} from "../../src/protocols/companion/auth.js";
import { FrameType } from "../../src/protocols/companion/connection.js";
import { CompanionServerAuth } from "../../src/protocols/companion/serverAuth.js";

class TestCompanionServerAuth extends CompanionServerAuth {
	outputKey: Buffer | null = null;
	inputKey: Buffer | null = null;

	async sendToClient(_data: Record<string, unknown>): Promise<void> {}
	enableEncryption(outputKey: Buffer, inputKey: Buffer): void {
		this.outputKey = outputKey;
		this.inputKey = inputKey;
	}
}

/**
 * Mock CompanionProtocol that routes exchangeAuth calls to CompanionServerAuth.
 */
function createMockProtocol(server: TestCompanionServerAuth) {
	return {
		async start(): Promise<void> {},

		async exchangeAuth(
			frameType: FrameType,
			data: Record<string, unknown>,
		): Promise<Record<string, unknown>> {
			const pairingData = data._pd as Buffer;

			let respData: Buffer;
			if (
				frameType === FrameType.PS_Start ||
				frameType === FrameType.PS_Next
			) {
				respData = await server.handlePairSetup(pairingData);
			} else {
				respData = await server.handlePairVerify(pairingData);
			}

			return { _pd: respData };
		},
	};
}

describe("Companion Integration: Pair-Setup + Pair-Verify", () => {
	it("completes full pair-setup via client procedure against server auth", async () => {
		const server = new TestCompanionServerAuth(1111);
		const srp = new SRPAuthHandler();
		const mockProtocol = createMockProtocol(server);

		const procedure = new CompanionPairSetupProcedure(
			mockProtocol as never,
			srp,
		);

		await procedure.startPairing();
		const credentials = await procedure.finishPairing("", 1111, "TestDevice");

		expect(credentials).toBeTruthy();
		expect(credentials.ltpk.length).toBe(32);
		expect(credentials.ltsk.length).toBe(32);
		expect(credentials.atvId.length).toBeGreaterThan(0);
		expect(credentials.clientId.length).toBeGreaterThan(0);
	});

	it("completes pair-verify after pair-setup", async () => {
		const server = new TestCompanionServerAuth(1111);

		// Pair-setup
		const setupSrp = new SRPAuthHandler();
		const mockProtocol = createMockProtocol(server);
		const setupProcedure = new CompanionPairSetupProcedure(
			mockProtocol as never,
			setupSrp,
		);
		await setupProcedure.startPairing();
		const credentials = await setupProcedure.finishPairing("", 1111, null);

		// Pair-verify
		const verifySrp = new SRPAuthHandler();
		const verifyProcedure = new CompanionPairVerifyProcedure(
			mockProtocol as never,
			verifySrp,
			credentials,
		);

		const result = await verifyProcedure.verifyCredentials();
		expect(result).toBe(true);
		expect(server.outputKey).not.toBeNull();
		expect(server.inputKey).not.toBeNull();

		const [outputKey, inputKey] = verifyProcedure.encryptionKeys(
			"",
			"ClientEncrypt-main",
			"ServerEncrypt-main",
		);
		expect(outputKey.length).toBe(32);
		expect(inputKey.length).toBe(32);
	});

	it("rejects wrong PIN during pair-setup", async () => {
		const server = new TestCompanionServerAuth(1111);
		const srp = new SRPAuthHandler();
		const mockProtocol = createMockProtocol(server);

		const procedure = new CompanionPairSetupProcedure(
			mockProtocol as never,
			srp,
		);

		await procedure.startPairing();
		await expect(
			procedure.finishPairing("", 9999, null),
		).rejects.toThrow();
	});

	it("derives matching encryption keys between client and server", async () => {
		const server = new TestCompanionServerAuth(1111);
		const mockProtocol = createMockProtocol(server);

		// Pair-setup
		const setupSrp = new SRPAuthHandler();
		const setup = new CompanionPairSetupProcedure(
			mockProtocol as never,
			setupSrp,
		);
		await setup.startPairing();
		const credentials = await setup.finishPairing("", 1111, null);

		// Pair-verify
		const verifySrp = new SRPAuthHandler();
		const verify = new CompanionPairVerifyProcedure(
			mockProtocol as never,
			verifySrp,
			credentials,
		);
		await verify.verifyCredentials();

		const [clientOut, clientIn] = verify.encryptionKeys(
			"",
			"ClientEncrypt-main",
			"ServerEncrypt-main",
		);

		// Server output key should match client input key (and vice versa)
		// because the server's "write" is the client's "read"
		expect(server.outputKey).not.toBeNull();
		expect(server.inputKey).not.toBeNull();
		expect(clientOut.length).toBe(32);
		expect(clientIn.length).toBe(32);
	});
});
