import * as net from "node:net";

const SLEEP_AFTER_CONNECT = 100;
const KNOCK_TIMEOUT_BUFFER = SLEEP_AFTER_CONNECT * 2;

const ABORT_KNOCK_ERRNOS = new Set(["EHOSTDOWN", "EHOSTUNREACH"]);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function asyncKnock(
	address: string,
	port: number,
	timeout: number,
): Promise<void> {
	return new Promise<void>((resolve) => {
		const socket = new net.Socket();
		let settled = false;
		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				socket.destroy();
				resolve();
			}
		}, timeout);

		socket.connect(port, address, () => {
			sleep(SLEEP_AFTER_CONNECT).then(() => {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					socket.destroy();
					resolve();
				}
			});
		});

		socket.on("error", (err: NodeJS.ErrnoException) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				socket.destroy();
				if (err.code && ABORT_KNOCK_ERRNOS.has(err.code)) {
					throw err;
				}
				resolve();
			}
		});
	});
}

export async function knock(
	address: string,
	ports: number[],
	timeout: number,
): Promise<void> {
	const knockRuntime = timeout * 1000 - KNOCK_TIMEOUT_BUFFER;
	const promises = ports.map((port) => asyncKnock(address, port, knockRuntime));
	await Promise.allSettled(promises);
}

export async function knocker(
	address: string,
	ports: number[],
	timeout = 4,
): Promise<void> {
	await knock(address, ports, timeout);
}
