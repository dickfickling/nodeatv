/**
 * Integration test: MRP client pairing procedures ↔ MrpServerAuth.
 *
 * Proves that MrpPairSetupProcedure and MrpPairVerifyProcedure can complete
 * a full round-trip against the server-side auth handler, entirely in-memory.
 */

import { describe, expect, it } from "vitest";
import { SRPAuthHandler } from "../../src/auth/hapSrp.js";
import { writeTlv } from "../../src/auth/hapTlv8.js";
import {
	MrpPairSetupProcedure,
	MrpPairVerifyProcedure,
} from "../../src/protocols/mrp/auth.js";
import { MrpServerAuth } from "../../src/protocols/mrp/serverAuth.js";
import type { ProtocolMessageObj } from "../../src/protocols/mrp/protobuf/index.js";

class TestMrpServerAuth extends MrpServerAuth {
	outputKey: Buffer | null = null;
	inputKey: Buffer | null = null;

	async sendToClient(_data: Buffer): Promise<void> {}
	enableEncryption(outputKey: Buffer, inputKey: Buffer): void {
		this.outputKey = outputKey;
		this.inputKey = inputKey;
	}
}

/**
 * Creates a mock MrpProtocol that routes messages to MrpServerAuth.
 */
function createMockProtocol(server: TestMrpServerAuth) {
	let isPairSetup = true;

	return {
		async start(_isPairing?: boolean): Promise<void> {},

		async sendAndReceive(
			msg: ProtocolMessageObj,
			_expectResponse?: boolean,
		): Promise<ProtocolMessageObj> {
			const inner = msg.cryptoPairingMessage as Record<string, unknown>;
			const pairingData = inner.pairingData as Buffer;
			const state = inner.state as number | undefined;

			// Detect pair-setup vs pair-verify from state field
			if (state === 2) {
				isPairSetup = true;
			} else if (state === 0 || state === undefined) {
				// After first message, state is 0 for subsequent pair-setup or pair-verify
			}

			let respData: Buffer;
			if (isPairSetup) {
				respData = await server.handlePairSetup(pairingData);
			} else {
				respData = await server.handlePairVerify(pairingData);
			}

			return {
				cryptoPairingMessage: {
					pairingData: respData,
					status: 0,
				},
			} as ProtocolMessageObj;
		},
	};
}

describe("MRP Integration: Pair-Setup + Pair-Verify", () => {
	it("completes full pair-setup via client procedure against server auth", async () => {
		const server = new TestMrpServerAuth(1111);
		const srp = new SRPAuthHandler();
		const mockProtocol = createMockProtocol(server);

		const procedure = new MrpPairSetupProcedure(
			mockProtocol as never,
			srp,
		);

		await procedure.startPairing();
		const credentials = await procedure.finishPairing("", 1111, null);

		expect(credentials).toBeTruthy();
		expect(credentials.ltpk.length).toBe(32);
		expect(credentials.ltsk.length).toBe(32);
		expect(credentials.atvId.length).toBeGreaterThan(0);
		expect(credentials.clientId.length).toBeGreaterThan(0);
	});

	it("completes pair-verify after pair-setup", async () => {
		const server = new TestMrpServerAuth(1111);

		// First, pair-setup
		const setupSrp = new SRPAuthHandler();
		const mockProtocol = createMockProtocol(server);
		const setupProcedure = new MrpPairSetupProcedure(
			mockProtocol as never,
			setupSrp,
		);
		await setupProcedure.startPairing();
		const credentials = await setupProcedure.finishPairing("", 1111, null);

		// Now pair-verify with a new SRP handler
		const verifySrp = new SRPAuthHandler();
		const verifyProtocol = createMockVerifyProtocol(server);
		const verifyProcedure = new MrpPairVerifyProcedure(
			verifyProtocol as never,
			verifySrp,
			credentials,
		);

		const result = await verifyProcedure.verifyCredentials();
		expect(result).toBe(true);

		// Server should have derived encryption keys
		expect(server.outputKey).not.toBeNull();
		expect(server.inputKey).not.toBeNull();

		// Client should also be able to derive encryption keys
		const [outputKey, inputKey] = verifyProcedure.encryptionKeys(
			"MediaRemote-Salt",
			"MediaRemote-Write-Encryption-Key",
			"MediaRemote-Read-Encryption-Key",
		);
		expect(outputKey.length).toBe(32);
		expect(inputKey.length).toBe(32);
	});

	it("rejects wrong PIN during pair-setup", async () => {
		const server = new TestMrpServerAuth(1111);
		const srp = new SRPAuthHandler();
		const mockProtocol = createMockProtocol(server);

		const procedure = new MrpPairSetupProcedure(
			mockProtocol as never,
			srp,
		);

		await procedure.startPairing();
		await expect(
			procedure.finishPairing("", 9999, null),
		).rejects.toThrow();
	});
});

/**
 * Mock protocol that always routes to handlePairVerify.
 */
function createMockVerifyProtocol(server: TestMrpServerAuth) {
	return {
		async start(): Promise<void> {},

		async sendAndReceive(
			msg: ProtocolMessageObj,
			_expectResponse?: boolean,
		): Promise<ProtocolMessageObj> {
			const inner = msg.cryptoPairingMessage as Record<string, unknown>;
			const pairingData = inner.pairingData as Buffer;

			const respData = await server.handlePairVerify(pairingData);

			return {
				cryptoPairingMessage: {
					pairingData: respData,
					status: 0,
				},
			} as ProtocolMessageObj;
		},
	};
}
