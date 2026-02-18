import * as net from "node:net";
import * as os from "node:os";

export function unusedPort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			if (addr && typeof addr === "object") {
				const port = addr.port;
				server.close(() => resolve(port));
			} else {
				server.close(() => reject(new Error("failed to get port")));
			}
		});
		server.on("error", reject);
	});
}

export function getPrivateAddresses(includeLoopback = true): string[] {
	const addresses: string[] = [];
	const interfaces = os.networkInterfaces();
	for (const iface of Object.values(interfaces)) {
		if (!iface) continue;
		for (const addr of iface) {
			if (addr.family !== "IPv4") continue;
			if (!addr.internal && !isPrivateIpv4(addr.address)) continue;
			if (addr.internal && !includeLoopback) continue;
			if (addr.internal || isPrivateIpv4(addr.address)) {
				addresses.push(addr.address);
			}
		}
	}
	return addresses;
}

function isPrivateIpv4(ip: string): boolean {
	const parts = ip.split(".").map(Number);
	if (parts[0] === 10) return true;
	if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
	if (parts[0] === 192 && parts[1] === 168) return true;
	if (parts[0] === 127) return true;
	return false;
}

export function getLocalAddressReaching(destIp: string): string | null {
	const interfaces = os.networkInterfaces();
	for (const iface of Object.values(interfaces)) {
		if (!iface) continue;
		for (const addr of iface) {
			if (addr.family !== "IPv4") continue;
			if (sameSubnet(addr.address, destIp, addr.netmask)) {
				return addr.address;
			}
		}
	}
	return null;
}

function sameSubnet(a: string, b: string, mask: string): boolean {
	const aParts = a.split(".").map(Number);
	const bParts = b.split(".").map(Number);
	const mParts = mask.split(".").map(Number);
	for (let i = 0; i < 4; i++) {
		if ((aParts[i] & mParts[i]) !== (bParts[i] & mParts[i])) return false;
	}
	return true;
}

export function tcpKeepalive(socket: net.Socket): void {
	socket.setKeepAlive(true, 1000);
}
