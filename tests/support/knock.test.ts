import * as net from "node:net";
import { describe, expect, it } from "vitest";
import { knock, knocker } from "../../src/support/knock.js";

function createKnockServer(): Promise<{
	port: number;
	gotKnock: () => boolean;
	close: () => void;
}> {
	return new Promise((resolve) => {
		let knocked = false;
		const server = net.createServer((socket) => {
			knocked = true;
			socket.destroy();
		});
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address() as net.AddressInfo;
			resolve({
				port: addr.port,
				gotKnock: () => knocked,
				close: () => server.close(),
			});
		});
	});
}

describe("knock", () => {
	it("knocks on single port", async () => {
		const server = await createKnockServer();
		try {
			await knock("127.0.0.1", [server.port], 2);
			// Give a moment for the connection to register
			await new Promise((r) => setTimeout(r, 200));
			expect(server.gotKnock()).toBe(true);
		} finally {
			server.close();
		}
	});

	it("knocks on multiple ports", async () => {
		const server1 = await createKnockServer();
		const server2 = await createKnockServer();
		try {
			await knock("127.0.0.1", [server1.port, server2.port], 2);
			await new Promise((r) => setTimeout(r, 200));
			expect(server1.gotKnock()).toBe(true);
			expect(server2.gotKnock()).toBe(true);
		} finally {
			server1.close();
			server2.close();
		}
	});

	it("does not throw on non-listening port", async () => {
		await expect(knock("127.0.0.1", [1], 0.5)).resolves.toBeUndefined();
	});

	it("handles timeout gracefully", async () => {
		await expect(knocker("169.254.0.0", [1], 0.3)).resolves.toBeUndefined();
	});
});
