import { createHash } from "node:crypto";
import * as net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { DnsMessage, QueryType } from "../../../src/support/dns.js";
import { DmapPairingHandler } from "../../../src/protocols/dmap/pairing.js";

function createMockCore(name = "TestRemote") {
	return {
		config: { address: "127.0.0.1", properties: {} },
		service: { port: 7000, properties: {}, credentials: null },
		settings: {
			info: { name },
			protocols: { dmap: { credentials: null } },
		},
	} as unknown as import("../../../src/core/core.js").Core;
}

function sendHttpPost(
	port: number,
	path: string,
	body: string,
): Promise<{ statusCode: number; body: Buffer }> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(port, "127.0.0.1", () => {
			const bodyBuf = Buffer.from(body, "utf-8");
			const request =
				`POST ${path} HTTP/1.1\r\n` +
				`Host: 127.0.0.1:${port}\r\n` +
				`Content-Length: ${bodyBuf.length}\r\n` +
				`\r\n` +
				body;
			socket.write(request);
		});

		let data = Buffer.alloc(0);
		socket.on("data", (chunk: Buffer) => {
			data = Buffer.concat([data, chunk]);
			// Try to parse response
			const str = data.toString();
			const headerEnd = str.indexOf("\r\n\r\n");
			if (headerEnd === -1) return;

			const headers = str.substring(0, headerEnd);
			const statusLine = headers.split("\r\n")[0];
			const statusCode = Number.parseInt(statusLine.split(" ")[1], 10);

			const responseBody = data.subarray(headerEnd + 4);
			socket.end();
			resolve({ statusCode, body: responseBody });
		});

		socket.on("error", reject);
		socket.setTimeout(2000, () => {
			socket.destroy();
			reject(new Error("timeout"));
		});
	});
}

describe("DmapPairingHandler", () => {
	let handler: DmapPairingHandler;

	afterEach(async () => {
		if (handler) {
			await handler.close();
		}
	});

	describe("begin()", () => {
		it("starts HTTP server on a port", async () => {
			const core = createMockCore();
			handler = new DmapPairingHandler(core, {
				pairingGuid: "0xAABBCCDDEEFF0011",
			});

			await handler.begin();

			// Server should be running - verify by connecting to the port
			// The handler stores port internally; we can verify by sending a request
			// to any path and getting back a 404
			// Access internal port via the mDNS packet
			const packet = handler._buildMdnsPacket("127.0.0.1", "test.local");
			const srvResource = packet.resources.find(
				(r) => r.qtype === QueryType.SRV,
			);
			expect(srvResource).toBeDefined();

			// Extract port from SRV rdata
			const srvRd = srvResource!.rd as Buffer;
			const port = srvRd.readUInt16BE(4);
			expect(port).toBeGreaterThan(0);
		});

		it("/pairing endpoint returns DMAP response for correct hash", async () => {
			const guid = "AABBCCDDEEFF0011";
			const core = createMockCore();
			handler = new DmapPairingHandler(core, {
				pairingGuid: `0x${guid}`,
			});
			handler.pin(1234);

			await handler.begin();

			// Get port from mDNS packet
			const packet = handler._buildMdnsPacket("127.0.0.1", "test.local");
			const srvResource = packet.resources.find(
				(r) => r.qtype === QueryType.SRV,
			);
			const srvRd = srvResource!.rd as Buffer;
			const port = srvRd.readUInt16BE(4);

			// Compute expected hash: guid + pin chars interleaved with \0
			let merged = guid;
			for (const char of "1234") {
				merged += char;
				merged += "\x00";
			}
			const hash = createHash("md5").update(merged, "utf-8").digest("hex");

			const response = await sendHttpPost(port, "/pairing", hash);
			expect(response.statusCode).toBe(200);
			expect(response.body.length).toBeGreaterThan(0);
		});

		it("/pairing endpoint returns 404 for wrong PIN", async () => {
			const core = createMockCore();
			handler = new DmapPairingHandler(core, {
				pairingGuid: "0xAABBCCDDEEFF0011",
			});
			handler.pin(1234);

			await handler.begin();

			const packet = handler._buildMdnsPacket("127.0.0.1", "test.local");
			const srvResource = packet.resources.find(
				(r) => r.qtype === QueryType.SRV,
			);
			const srvRd = srvResource!.rd as Buffer;
			const port = srvRd.readUInt16BE(4);

			const response = await sendHttpPost(port, "/pairing", "wronghash");
			expect(response.statusCode).toBe(404);
		});
	});

	describe("close()", () => {
		it("stops the server", async () => {
			const core = createMockCore();
			handler = new DmapPairingHandler(core, {
				pairingGuid: "0xAABBCCDDEEFF0011",
			});

			await handler.begin();

			// Get port
			const packet = handler._buildMdnsPacket("127.0.0.1", "test.local");
			const srvResource = packet.resources.find(
				(r) => r.qtype === QueryType.SRV,
			);
			const srvRd = srvResource!.rd as Buffer;
			const port = srvRd.readUInt16BE(4);

			await handler.close();

			// Connection should fail after close
			await expect(
				sendHttpPost(port, "/pairing", "test"),
			).rejects.toThrow();
		});
	});

	describe("mDNS announcement packet", () => {
		it("has correct structure", () => {
			const core = createMockCore("MyRemote");
			handler = new DmapPairingHandler(core, {
				pairingGuid: "0xAABBCCDDEEFF0011",
			});

			const packet = handler._buildMdnsPacket(
				"192.168.1.100",
				"myhost.local",
			);

			// Should have PTR answer
			expect(packet.answers.length).toBe(1);
			const ptr = packet.answers[0];
			expect(ptr.qtype).toBe(QueryType.PTR);
			expect(ptr.qname).toBe("_touch-remote._tcp.local");
			expect(ptr.rd).toBe("MyRemote._touch-remote._tcp.local");

			// Should have SRV, TXT, and A in resources
			expect(packet.resources.length).toBe(3);

			const srv = packet.resources.find((r) => r.qtype === QueryType.SRV);
			expect(srv).toBeDefined();
			expect(srv!.qname).toBe("MyRemote._touch-remote._tcp.local");

			const txt = packet.resources.find((r) => r.qtype === QueryType.TXT);
			expect(txt).toBeDefined();
			expect(txt!.qname).toBe("MyRemote._touch-remote._tcp.local");

			const a = packet.resources.find((r) => r.qtype === QueryType.A);
			expect(a).toBeDefined();
			expect(a!.qname).toBe("myhost.local");

			// A record should encode the IP
			const aRd = a!.rd as Buffer;
			expect(aRd).toEqual(Buffer.from([192, 168, 1, 100]));
		});

		it("packet can be packed without error", () => {
			const core = createMockCore();
			handler = new DmapPairingHandler(core, {
				pairingGuid: "0xAABBCCDDEEFF0011",
			});

			const packet = handler._buildMdnsPacket("10.0.0.1", "test.local");
			const packed = packet.pack();

			expect(packed).toBeInstanceOf(Buffer);
			expect(packed.length).toBeGreaterThan(12); // At least header size

			// Can be unpacked back
			const unpacked = new DnsMessage().unpack(packed);
			expect(unpacked.answers.length).toBe(1);
		});

		it("TXT record contains required properties", () => {
			const core = createMockCore("TestRemote");
			handler = new DmapPairingHandler(core, {
				pairingGuid: "0xAABBCCDDEEFF0011",
			});

			const packet = handler._buildMdnsPacket("10.0.0.1", "test.local");
			const txt = packet.resources.find((r) => r.qtype === QueryType.TXT);
			expect(txt).toBeDefined();

			// Decode TXT rdata - it's formatted as length-prefixed key=value pairs
			const rd = txt!.rd as Buffer;
			const txtStr = rd.toString("utf-8");
			expect(txtStr).toContain("DvNm=TestRemote");
			expect(txtStr).toContain("RemV=10000");
			expect(txtStr).toContain("DvTy=iPod");
			expect(txtStr).toContain("RemN=Remote");
			expect(txtStr).toContain("Pair=AABBCCDDEEFF0011");
		});
	});
});
