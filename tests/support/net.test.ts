import * as net from "node:net";
import { describe, expect, it } from "vitest";
import {
	getPrivateAddresses,
	tcpKeepalive,
	unusedPort,
} from "../../src/support/net.js";

describe("unusedPort", () => {
	it("returns a free port", async () => {
		const port = await unusedPort();
		expect(port).toBeGreaterThan(0);
		expect(port).toBeLessThan(65536);
	});
});

describe("getPrivateAddresses", () => {
	it("returns addresses (at least loopback on most systems)", () => {
		const addrs = getPrivateAddresses();
		expect(Array.isArray(addrs)).toBe(true);
	});

	it("excludes loopback when asked", () => {
		const addrs = getPrivateAddresses(false);
		for (const addr of addrs) {
			expect(addr.startsWith("127.")).toBe(false);
		}
	});
});

describe("tcpKeepalive", () => {
	it("enables keepalive on a socket", async () => {
		const server = net.createServer();
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		const addr = server.address() as net.AddressInfo;

		const client = new net.Socket();
		await new Promise<void>((resolve) =>
			client.connect(addr.port, "127.0.0.1", resolve),
		);

		tcpKeepalive(client);

		client.destroy();
		server.close();
	});
});
