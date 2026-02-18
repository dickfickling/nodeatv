/**
 * Integration test: AirPlay HAP client pairing procedures ↔ AirPlayServerAuth.
 */

import { describe, expect, it } from "vitest";
import { SRPAuthHandler } from "../../src/auth/hapSrp.js";
import {
	AirPlayHapPairSetupProcedure,
	AirPlayHapPairVerifyProcedure,
} from "../../src/protocols/airplay/auth/hap.js";
import { AirPlayServerAuth } from "../../src/protocols/airplay/serverAuth.js";
import type { HttpResponse } from "../../src/support/http.js";

/**
 * Mock HttpConnection that routes requests to AirPlayServerAuth.
 */
function createMockHttp(server: AirPlayServerAuth) {
	return {
		receiveProcessor: (data: Buffer) => data,
		sendProcessor: (data: Buffer) => data,

		async post(
			path: string,
			options?: { headers?: Record<string, string>; body?: string | Buffer },
		): Promise<HttpResponse> {
			const body = options?.body as Buffer | undefined;

			let respBody: Buffer;
			if (path === "/pair-pin-start") {
				respBody = Buffer.alloc(0);
			} else if (path === "/pair-setup") {
				respBody = await server.handlePairSetup(body ?? Buffer.alloc(0));
			} else if (path === "/pair-verify") {
				respBody = await server.handlePairVerify(body ?? Buffer.alloc(0));
			} else {
				throw new Error(`Unexpected path: ${path}`);
			}

			return {
				protocol: "HTTP",
				version: "1.1",
				code: 200,
				message: "OK",
				headers: { "content-type": "application/octet-stream" },
				body: respBody,
			};
		},

		close(): void {},
	};
}

describe("AirPlay Integration: HAP Pair-Setup + Pair-Verify", () => {
	it("completes full HAP pair-setup via client procedure against server auth", async () => {
		const server = new AirPlayServerAuth(1111);
		const srp = new SRPAuthHandler();
		const mockHttp = createMockHttp(server);

		const procedure = new AirPlayHapPairSetupProcedure(
			mockHttp as never,
			srp,
		);

		await procedure.startPairing();
		const credentials = await procedure.finishPairing("", 1111, null);

		expect(credentials).toBeTruthy();
		expect(credentials.ltpk.length).toBe(32);
		expect(credentials.ltsk.length).toBe(32);
		expect(credentials.atvId.length).toBeGreaterThan(0);
	});

	it("completes pair-verify after pair-setup", async () => {
		const server = new AirPlayServerAuth(1111);
		const mockHttp = createMockHttp(server);

		// Pair-setup
		const setupSrp = new SRPAuthHandler();
		const setupProcedure = new AirPlayHapPairSetupProcedure(
			mockHttp as never,
			setupSrp,
		);
		await setupProcedure.startPairing();
		const credentials = await setupProcedure.finishPairing("", 1111, null);

		// Pair-verify
		const verifySrp = new SRPAuthHandler();
		const verifyProcedure = new AirPlayHapPairVerifyProcedure(
			mockHttp as never,
			verifySrp,
			credentials,
		);

		const result = await verifyProcedure.verifyCredentials();
		expect(result).toBe(true);

		const [outputKey, inputKey] = verifyProcedure.encryptionKeys(
			"Control-Salt",
			"Control-Write-Encryption-Key",
			"Control-Read-Encryption-Key",
		);
		expect(outputKey.length).toBe(32);
		expect(inputKey.length).toBe(32);
	});

	it("rejects wrong PIN during pair-setup", async () => {
		const server = new AirPlayServerAuth(1111);
		const srp = new SRPAuthHandler();
		const mockHttp = createMockHttp(server);

		const procedure = new AirPlayHapPairSetupProcedure(
			mockHttp as never,
			srp,
		);

		await procedure.startPairing();
		await expect(
			procedure.finishPairing("", 9999, null),
		).rejects.toThrow();
	});
});
