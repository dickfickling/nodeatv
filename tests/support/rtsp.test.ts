import { describe, expect, it } from "vitest";
import type { HttpConnection, HttpResponse } from "../../src/support/http.js";
import { getDigestPayload, RtspSession } from "../../src/support/rtsp.js";

describe("getDigestPayload", () => {
	it("generates correct digest authorization string", () => {
		const result = getDigestPayload(
			"ANNOUNCE",
			"rtsp://192.168.1.1/12345",
			"pyatv",
			"raop",
			"password",
			"nonce123",
		);

		expect(result).toContain('Digest username="pyatv"');
		expect(result).toContain('realm="raop"');
		expect(result).toContain('nonce="nonce123"');
		expect(result).toContain('uri="rtsp://192.168.1.1/12345"');
		expect(result).toContain('response="');
	});

	it("produces deterministic output for same inputs", () => {
		const result1 = getDigestPayload(
			"GET",
			"/info",
			"user",
			"realm",
			"pass",
			"abc",
		);
		const result2 = getDigestPayload(
			"GET",
			"/info",
			"user",
			"realm",
			"pass",
			"abc",
		);
		expect(result1).toBe(result2);
	});

	it("produces different output for different methods", () => {
		const result1 = getDigestPayload(
			"GET",
			"/info",
			"user",
			"realm",
			"pass",
			"abc",
		);
		const result2 = getDigestPayload(
			"POST",
			"/info",
			"user",
			"realm",
			"pass",
			"abc",
		);
		expect(result1).not.toBe(result2);
	});
});

describe("RtspSession", () => {
	function createMockConnection(): HttpConnection {
		return {
			localIp: "192.168.1.100",
			remoteIp: "192.168.1.200",
			sendAndReceive: async (): Promise<HttpResponse> => ({
				protocol: "RTSP",
				version: "1.0",
				code: 200,
				message: "OK",
				headers: { CSeq: "0" },
				body: "",
			}),
			get: async (): Promise<HttpResponse> => ({
				protocol: "HTTP",
				version: "1.1",
				code: 200,
				message: "OK",
				headers: {},
				body: "{}",
			}),
			post: async (): Promise<HttpResponse> => ({
				protocol: "HTTP",
				version: "1.1",
				code: 200,
				message: "OK",
				headers: {},
				body: Buffer.alloc(0),
			}),
			close: () => {},
		} as unknown as HttpConnection;
	}

	it("creates session with random identifiers", () => {
		const conn = createMockConnection();
		const session = new RtspSession(conn);

		expect(session.sessionId).toBeGreaterThanOrEqual(0);
		expect(session.dacpId).toBeTruthy();
		expect(session.activeRemote).toBeGreaterThanOrEqual(0);
		expect(session.cseq).toBe(0);
	});

	it("generates correct uri format", () => {
		const conn = createMockConnection();
		const session = new RtspSession(conn);

		const uri = session.uri;
		expect(uri).toMatch(/^rtsp:\/\/192\.168\.1\.100\/\d+$/);
	});

	it("increments cseq on each exchange", async () => {
		const conn = createMockConnection();
		const session = new RtspSession(conn);

		expect(session.cseq).toBe(0);
		await session.exchange("GET", { uri: "/info" });
		expect(session.cseq).toBe(1);
		await session.exchange("GET", { uri: "/info" });
		expect(session.cseq).toBe(2);
	});

	it("sends CSeq header in requests", async () => {
		let capturedHeaders: Record<string, string> | undefined;
		const conn = {
			localIp: "192.168.1.100",
			remoteIp: "192.168.1.200",
			sendAndReceive: async (
				_method: string,
				_uri: string,
				options?: { headers?: Record<string, string> },
			): Promise<HttpResponse> => {
				capturedHeaders = options?.headers as Record<string, string>;
				return {
					protocol: "RTSP",
					version: "1.0",
					code: 200,
					message: "OK",
					headers: { CSeq: capturedHeaders?.CSeq ?? "0" },
					body: "",
				};
			},
		} as unknown as HttpConnection;

		const session = new RtspSession(conn);
		await session.exchange("GET", { uri: "/info" });

		expect(capturedHeaders?.CSeq).toBe("0");
		expect(capturedHeaders?.["DACP-ID"]).toBeTruthy();
		expect(capturedHeaders?.["Active-Remote"]).toBeTruthy();
		expect(capturedHeaders?.["Client-Instance"]).toBeTruthy();
	});

	it("info returns empty object on non-200", async () => {
		const conn = {
			localIp: "192.168.1.100",
			remoteIp: "192.168.1.200",
			sendAndReceive: async (): Promise<HttpResponse> => ({
				protocol: "RTSP",
				version: "1.0",
				code: 404,
				message: "Not Found",
				headers: { CSeq: "0" },
				body: "",
			}),
		} as unknown as HttpConnection;

		const session = new RtspSession(conn);
		const result = await session.info();
		expect(result).toEqual({});
	});

	it("digestInfo is null by default", () => {
		const conn = createMockConnection();
		const session = new RtspSession(conn);
		expect(session.digestInfo).toBeNull();
	});
});
