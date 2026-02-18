/**
 * Minimalistic DNS-SD implementation.
 */

import * as dgram from "node:dgram";
import { CaseInsensitiveDict } from "../support/collections.js";
import {
	type DnsMessage,
	DnsMessage as DnsMessageClass,
	type DnsResource,
	QueryType,
	ServiceInstanceName,
} from "../support/dns.js";
import { getPrivateAddresses } from "../support/net.js";

// Number of services to include in each request
const SERVICES_PER_MSG = 3;

export const SLEEP_PROXY_SERVICE = "_sleep-proxy._udp.local";
export const DEVICE_INFO_SERVICE = "_device-info._tcp.local";

// Re-export QueryType for convenience
export { QueryType };

// --- Service / Response ---

export interface Service {
	type: string;
	name: string;
	address: string | null;
	port: number;
	properties: Record<string, string>;
}

export interface Response {
	services: Service[];
	deepSleep: boolean;
	model: string | null;
}

// --- Helpers ---

export function decodeValue(value: Buffer | Uint8Array): string {
	try {
		const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
		return buf
			.toString("utf-8")
			.replace(/\u00a0/g, " ")
			.replace(/\xc2\xa0/g, " ");
	} catch {
		return String(value);
	}
}

function decodeProperties(
	properties: CaseInsensitiveDict<Buffer> | Record<string, Buffer>,
): Record<string, string> {
	const result: Record<string, string> = {};
	const entries =
		properties instanceof CaseInsensitiveDict
			? [...properties]
			: Object.entries(properties);
	for (const [k, v] of entries) {
		result[k] = decodeValue(v);
	}
	return result;
}

export function createServiceQueries(
	services: string[],
	qtype: QueryType,
): Buffer[] {
	const queries: Buffer[] = [];
	for (let i = 0; i < Math.ceil(services.length / SERVICES_PER_MSG); i++) {
		const serviceChunk = services.slice(
			i * SERVICES_PER_MSG,
			i * SERVICES_PER_MSG + SERVICES_PER_MSG,
		);

		const msg = new DnsMessageClass(0x35ff);
		for (const s of serviceChunk) {
			msg.questions.push({ qname: s, qtype, qclass: 0x8001 });
		}
		msg.questions.push({
			qname: SLEEP_PROXY_SERVICE,
			qtype,
			qclass: 0x8001,
		});

		queries.push(msg.pack());
	}
	return queries;
}

function getModel(services: Service[]): string | null {
	for (const service of services) {
		if (service.type === DEVICE_INFO_SERVICE) {
			return service.properties.model ?? null;
		}
	}
	return null;
}

function firstRd(
	qtype: QueryType,
	entries: Map<number, DnsResource[]>,
): unknown | null {
	const resources = entries.get(qtype);
	if (resources && resources.length > 0) {
		return resources[0].rd;
	}
	return null;
}

function isLinkLocal(ip: string): boolean {
	return ip.startsWith("169.254.");
}

// --- ServiceParser ---

export class ServiceParser {
	table: Map<string, Map<number, DnsResource[]>> = new Map();
	ptrs: Map<string, string> = new Map();
	private _cache: Service[] | null = null;

	addMessage(message: DnsMessage): ServiceParser {
		this._cache = null;

		const records = [...(message.answers ?? []), ...(message.resources ?? [])];
		for (const record of records) {
			if (record.qtype === QueryType.PTR && record.qname.startsWith("_")) {
				this.ptrs.set(record.qname, record.rd as string);
			} else {
				if (!this.table.has(record.qname)) {
					this.table.set(record.qname, new Map());
				}
				const entry = this.table.get(record.qname)!;
				if (!entry.has(record.qtype)) {
					entry.set(record.qtype, []);
				}
				const list = entry.get(record.qtype)!;
				// Don't add duplicates
				const isDuplicate = list.some(
					(existing) =>
						existing.qname === record.qname &&
						existing.qtype === record.qtype &&
						existing.qclass === record.qclass &&
						existing.ttl === record.ttl &&
						JSON.stringify(existing.rd) === JSON.stringify(record.rd),
				);
				if (!isDuplicate) {
					list.push(record);
				}
			}
		}
		return this;
	}

	parse(): Service[] {
		if (this._cache) {
			return this._cache;
		}

		const results = new Map<string, Service>();

		for (const [service, device] of this.table) {
			let serviceName: ServiceInstanceName;
			try {
				serviceName = ServiceInstanceName.splitName(service);
			} catch {
				continue;
			}

			const srvRd = firstRd(QueryType.SRV, device) as Record<
				string,
				unknown
			> | null;
			const target = srvRd ? (srvRd.target as string) : null;

			const targetRecords = target
				? (this.table.get(target)?.get(QueryType.A) ?? [])
				: [];

			let address: string | null = null;
			for (const record of targetRecords) {
				const addr = record.rd as string;
				if (!isLinkLocal(addr)) {
					address = addr;
					break;
				}
			}

			const txtRd = firstRd(QueryType.TXT, device);
			const properties =
				txtRd instanceof CaseInsensitiveDict
					? decodeProperties(txtRd)
					: txtRd && typeof txtRd === "object"
						? decodeProperties(txtRd as Record<string, Buffer>)
						: {};

			results.set(service, {
				type: serviceName.ptrName,
				name: serviceName.instance ?? "",
				address,
				port: srvRd ? (srvRd.port as number) : 0,
				properties,
			});
		}

		// If there are PTRs to unknown services, create placeholders
		for (const [qname, realName] of this.ptrs) {
			if (!results.has(realName)) {
				results.set(realName, {
					type: qname,
					name: realName.split(".")[0],
					address: null,
					port: 0,
					properties: {},
				});
			}
		}

		this._cache = [...results.values()];
		return this._cache;
	}
}

// --- Unicast DNS-SD ---

export async function unicast(
	address: string,
	services: string[],
	port = 5353,
	timeout = 4,
): Promise<Response> {
	const queries = createServiceQueries(services, QueryType.PTR);
	const parser = new ServiceParser();
	let receivedResponses = 0;

	return new Promise<Response>((resolve) => {
		const socket = dgram.createSocket("udp4");
		let resendInterval: ReturnType<typeof setInterval> | null = null;
		let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
		let resolved = false;

		function finish() {
			if (resolved) return;
			resolved = true;
			if (resendInterval) clearInterval(resendInterval);
			if (timeoutTimer) clearTimeout(timeoutTimer);
			socket.close();

			const srvs = parser.parse();
			resolve({
				services: srvs,
				deepSleep: false,
				model: getModel(srvs),
			});
		}

		socket.on("message", (data: Buffer) => {
			parser.addMessage(new DnsMessageClass().unpack(data));
			receivedResponses++;

			if (receivedResponses >= queries.length) {
				finish();
			}
		});

		socket.on("error", () => {
			finish();
		});

		// Send queries repeatedly
		function sendQueries() {
			for (const query of queries) {
				socket.send(query, port, address);
			}
		}

		sendQueries();
		resendInterval = setInterval(sendQueries, 1000);
		timeoutTimer = setTimeout(finish, timeout * 1000);
	});
}

// --- Multicast DNS-SD ---

interface QueryResponse {
	count: number;
	deepSleep: boolean;
	parser: ServiceParser;
}

function createMcastSocket(
	bindAddress: string | null,
	bindPort: number,
): dgram.Socket {
	const socket = dgram.createSocket({
		type: "udp4",
		reuseAddr: true,
	});

	socket.bind(bindPort, bindAddress ?? "", () => {
		socket.setMulticastTTL(10);
		socket.setMulticastLoopback(true);

		if (bindAddress) {
			try {
				socket.addMembership("224.0.0.251", bindAddress);
			} catch {
				// Ignore membership errors
			}
			try {
				socket.setMulticastInterface(bindAddress);
			} catch {
				// Ignore interface errors
			}
		}
	});

	return socket;
}

export async function multicast(
	services: string[],
	address = "224.0.0.251",
	port = 5353,
	timeout = 4,
	endCondition?: ((response: Response) => boolean) | null,
): Promise<Response[]> {
	const queries = createServiceQueries(services, QueryType.PTR);
	const queryResponses = new Map<string, QueryResponse>();
	const sockets: dgram.Socket[] = [];

	return new Promise<Response[]>((mainResolve) => {
		let resendInterval: ReturnType<typeof setInterval> | null = null;
		let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
		let resolved = false;

		function cleanup() {
			if (resendInterval) clearInterval(resendInterval);
			if (timeoutTimer) clearTimeout(timeoutTimer);
			for (const s of sockets) {
				try {
					s.close();
				} catch {
					// ignore
				}
			}
		}

		function finish() {
			if (resolved) return;
			resolved = true;
			cleanup();

			const responses: Response[] = [];
			for (const qr of queryResponses.values()) {
				const srvs = qr.parser.parse();
				responses.push({
					services: srvs,
					deepSleep: qr.deepSleep,
					model: getModel(srvs),
				});
			}
			mainResolve(responses);
		}

		function handleMessage(data: Buffer, rinfo: dgram.RemoteInfo) {
			if (resolved) return;

			let decodedMsg: DnsMessage;
			try {
				decodedMsg = new DnsMessageClass().unpack(data);
			} catch {
				return;
			}

			const tempParser = new ServiceParser();
			let tempServices: Service[];
			try {
				tempServices = tempParser.addMessage(decodedMsg).parse();
			} catch {
				return;
			}

			if (tempServices.length === 0) return;

			// Check if response is for our services
			for (const svc of tempServices) {
				if (
					!services.includes(svc.type) &&
					svc.type !== DEVICE_INFO_SERVICE &&
					svc.type !== SLEEP_PROXY_SERVICE
				) {
					return;
				}
			}

			const addr = rinfo.address;
			if (!queryResponses.has(addr)) {
				queryResponses.set(addr, {
					count: 0,
					deepSleep: false,
					parser: new ServiceParser(),
				});
			}

			const qr = queryResponses.get(addr)!;
			const isSleepProxy = tempServices.every((s) => s.port === 0);
			qr.count++;
			qr.deepSleep = qr.deepSleep || isSleepProxy;
			qr.parser.addMessage(decodedMsg);

			if (!isSleepProxy && qr.count >= queries.length) {
				if (endCondition) {
					const response: Response = {
						services: qr.parser.parse(),
						deepSleep: qr.deepSleep,
						model: getModel(qr.parser.parse()),
					};
					if (endCondition(response)) {
						// Matches end condition - keep only this response
						const kept = queryResponses.get(addr)!;
						queryResponses.clear();
						queryResponses.set(addr, kept);
						finish();
					}
				}
			}
		}

		// Socket listening on port 5353 from anywhere
		const anySocket = createMcastSocket(null, 5353);
		sockets.push(anySocket);
		anySocket.on("message", handleMessage);
		anySocket.on("error", () => {});

		// One socket per local IP address
		for (const addr of getPrivateAddresses()) {
			try {
				const sock = createMcastSocket(addr, 0);
				sockets.push(sock);
				sock.on("message", handleMessage);
				sock.on("error", () => {});
			} catch {
				// Ignore
			}
		}

		function sendQueries() {
			for (const query of queries) {
				for (const sock of sockets) {
					try {
						sock.send(query, port, address);
					} catch {
						// ignore send errors
					}
				}
			}
		}

		// Wait a bit for sockets to bind then start sending
		setTimeout(() => {
			sendQueries();
			resendInterval = setInterval(sendQueries, 1000);
		}, 50);

		timeoutTimer = setTimeout(finish, timeout * 1000);
	});
}
