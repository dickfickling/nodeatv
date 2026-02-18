import { describe, expect, it } from "vitest";
import { SRPAuthHandler } from "../../../src/auth/hapSrp.js";
import { readTlv, TlvValue, writeTlv } from "../../../src/auth/hapTlv8.js";
import {
	AirPlayServerAuth,
	PlayFair,
} from "../../../src/protocols/airplay/serverAuth.js";

describe("PlayFair", () => {
	it("returns hardcoded responses", () => {
		const pf = new PlayFair();
		const stage1 = pf.handleSetup(Buffer.from("test"));
		expect(stage1.length).toBe(130);
		const stage2 = pf.handleSetup(Buffer.from("test2"));
		expect(stage2.length).toBe(32);
	});
});

describe("AirPlayServerAuth", () => {
	it("handles pair-setup flow", async () => {
		const server = new AirPlayServerAuth(1111);
		const client = new SRPAuthHandler();
		client.initialize();

		// M1
		const m1Tlv = new Map<number, Buffer>();
		m1Tlv.set(TlvValue.Method, Buffer.from([0x00]));
		m1Tlv.set(TlvValue.SeqNo, Buffer.from([0x01]));
		const m2Data = await server.handlePairSetup(writeTlv(m1Tlv));
		const m2Tlv = readTlv(m2Data);

		expect(m2Tlv.get(TlvValue.SeqNo)?.[0]).toBe(0x02);

		// M3
		client.step1(1111);
		const [pubKey, proof] = client.step2(
			m2Tlv.get(TlvValue.PublicKey)!,
			m2Tlv.get(TlvValue.Salt)!,
		);

		const m3Tlv = new Map<number, Buffer>();
		m3Tlv.set(TlvValue.SeqNo, Buffer.from([0x03]));
		m3Tlv.set(TlvValue.PublicKey, pubKey);
		m3Tlv.set(TlvValue.Proof, proof);
		const m4Data = await server.handlePairSetup(writeTlv(m3Tlv));
		const m4Tlv = readTlv(m4Data);

		expect(m4Tlv.get(TlvValue.SeqNo)?.[0]).toBe(0x04);
		expect(m4Tlv.has(TlvValue.Proof)).toBe(true);

		// M5
		const m5Tlv = new Map<number, Buffer>();
		m5Tlv.set(TlvValue.SeqNo, Buffer.from([0x05]));
		m5Tlv.set(TlvValue.EncryptedData, client.step3());
		const m6Data = await server.handlePairSetup(writeTlv(m5Tlv));
		const m6Tlv = readTlv(m6Data);

		expect(m6Tlv.get(TlvValue.SeqNo)?.[0]).toBe(0x06);

		const credentials = client.step4(m6Tlv.get(TlvValue.EncryptedData)!);
		expect(credentials.ltpk.length).toBe(32);
	});

	it("handles pair-verify flow", async () => {
		const server = new AirPlayServerAuth(1111);
		const client = new SRPAuthHandler();
		client.initialize();

		// Quick pair-setup
		const m1Tlv = new Map<number, Buffer>();
		m1Tlv.set(TlvValue.Method, Buffer.from([0x00]));
		m1Tlv.set(TlvValue.SeqNo, Buffer.from([0x01]));
		const m2Data = await server.handlePairSetup(writeTlv(m1Tlv));
		const m2Tlv = readTlv(m2Data);
		client.step1(1111);
		const [pubKey, proof] = client.step2(
			m2Tlv.get(TlvValue.PublicKey)!,
			m2Tlv.get(TlvValue.Salt)!,
		);
		const m3Tlv = new Map<number, Buffer>();
		m3Tlv.set(TlvValue.SeqNo, Buffer.from([0x03]));
		m3Tlv.set(TlvValue.PublicKey, pubKey);
		m3Tlv.set(TlvValue.Proof, proof);
		await server.handlePairSetup(writeTlv(m3Tlv));
		const m5Tlv = new Map<number, Buffer>();
		m5Tlv.set(TlvValue.SeqNo, Buffer.from([0x05]));
		m5Tlv.set(TlvValue.EncryptedData, client.step3());
		const m6Data = await server.handlePairSetup(writeTlv(m5Tlv));
		const credentials = client.step4(
			readTlv(m6Data).get(TlvValue.EncryptedData)!,
		);

		// Pair-verify
		const verifyClient = new SRPAuthHandler();
		const [, verifyPubKey] = verifyClient.initialize();

		const v1Tlv = new Map<number, Buffer>();
		v1Tlv.set(TlvValue.SeqNo, Buffer.from([0x01]));
		v1Tlv.set(TlvValue.PublicKey, verifyPubKey);
		const v2Data = await server.handlePairVerify(writeTlv(v1Tlv));
		const v2Tlv = readTlv(v2Data);

		expect(v2Tlv.get(TlvValue.SeqNo)?.[0]).toBe(0x02);

		const encryptedResponse = verifyClient.verify1(
			credentials,
			v2Tlv.get(TlvValue.PublicKey)!,
			v2Tlv.get(TlvValue.EncryptedData)!,
		);

		const v3Tlv = new Map<number, Buffer>();
		v3Tlv.set(TlvValue.SeqNo, Buffer.from([0x03]));
		v3Tlv.set(TlvValue.EncryptedData, encryptedResponse);
		await server.handlePairVerify(writeTlv(v3Tlv));

		expect(server.outputKey).not.toBeNull();
		expect(server.inputKey).not.toBeNull();
	});

	it("handles /info request", async () => {
		const server = new AirPlayServerAuth();
		const info = await server.handleInfo();
		expect(info.name).toBe("AirPlayTestServer");
		expect(info.model).toBe("AppleTV6,2");
		expect(typeof info.pk).toBe("string");
	});

	it("handles /fp-setup requests", async () => {
		const server = new AirPlayServerAuth();
		const stage1 = await server.handleFpSetup(Buffer.from("data"));
		expect(stage1.length).toBe(130);
		const stage2 = await server.handleFpSetup(Buffer.from("data"));
		expect(stage2.length).toBe(32);
	});
});
