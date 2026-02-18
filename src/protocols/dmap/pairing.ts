/**
 * Module used for pairing with a device using the DMAP protocol.
 */

import { createHash } from "node:crypto";
import * as dgram from "node:dgram";
import type * as net from "node:net";
import * as os from "node:os";
import type { Core } from "../../core/core.js";
import {
	DnsMessage,
	formatTxtDict,
	QueryType,
	qnameEncode,
} from "../../support/dns.js";
import {
	BasicHttpServer,
	type HttpRequest,
	type HttpResponse,
	HttpSimpleRouter,
	httpServer,
} from "../../support/http.js";
import * as tags from "./tags.js";

const MDNS_ADDRESS = "224.0.0.251";
const MDNS_PORT = 5353;
const ANNOUNCE_INTERVAL_MS = 3000;

function generateRandomGuid(): string {
	const bits = BigInt(Math.floor(Math.random() * 2 ** 64));
	return `0x${bits.toString(16).toUpperCase()}`;
}

function getLocalIpAddress(): string {
	const interfaces = os.networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name] ?? []) {
			if (iface.family === "IPv4" && !iface.internal) {
				return iface.address;
			}
		}
	}
	return "127.0.0.1";
}

export interface DmapPairingHandlerOptions {
	name?: string;
	pairingGuid?: string;
}

export class DmapPairingHandler {
	private _core: Core;
	private _name: string;
	private _pinCode: number | null = null;
	private _hasPaired = false;
	private _pairingGuid: string;
	private _server: net.Server | null = null;
	private _mdnsSocket: dgram.Socket | null = null;
	private _announceTimer: ReturnType<typeof setInterval> | null = null;
	private _serverPort = 0;

	constructor(core: Core, options: DmapPairingHandlerOptions = {}) {
		this._core = core;
		this._name = options.name ?? core.settings.info.name;
		const rawGuid = options.pairingGuid ?? generateRandomGuid();
		// Strip leading "0x" if present and uppercase
		this._pairingGuid = rawGuid.replace(/^0x/i, "").toUpperCase();
	}

	get hasPaired(): boolean {
		return this._hasPaired;
	}

	get deviceProvidesPin(): boolean {
		return false;
	}

	pin(pin: number): void {
		this._pinCode = pin;
	}

	async begin(): Promise<void> {
		const router = new HttpSimpleRouter();
		router.addRoute(
			"POST",
			"^/pairing$",
			(request: HttpRequest): HttpResponse => {
				const body =
					typeof request.body === "string"
						? request.body
						: request.body.toString("hex");
				const hash = body.replace(/\s/g, "");
				const result = this.handleRequest(this._name, hash);

				if (result) {
					return {
						protocol: "HTTP",
						version: "1.1",
						code: 200,
						message: "OK",
						headers: { "Content-Type": "application/octet-stream" },
						body: result,
					};
				}

				return {
					protocol: "HTTP",
					version: "1.1",
					code: 404,
					message: "Not Found",
					headers: {},
					body: "Pairing failed",
				};
			},
		);

		const [server, port] = await httpServer(
			() => new BasicHttpServer(router),
			"0.0.0.0",
			0,
		);
		this._server = server;
		this._serverPort = port;

		// Build and send mDNS announcement
		const localIp = getLocalIpAddress();
		const hostname = `${os.hostname()}.local`;
		const packet = this._buildMdnsPacket(localIp, hostname);

		const socket = dgram.createSocket({
			type: "udp4",
			reuseAddr: true,
		});
		this._mdnsSocket = socket;

		await new Promise<void>((resolve, reject) => {
			socket.bind(0, () => {
				try {
					socket.addMembership(MDNS_ADDRESS);
				} catch {
					// Membership may fail in some environments, continue anyway
				}
				resolve();
			});
			socket.on("error", reject);
		});

		const packetBuf = packet.pack();
		socket.send(packetBuf, 0, packetBuf.length, MDNS_PORT, MDNS_ADDRESS);

		// Re-announce periodically
		this._announceTimer = setInterval(() => {
			if (this._mdnsSocket) {
				this._mdnsSocket.send(
					packetBuf,
					0,
					packetBuf.length,
					MDNS_PORT,
					MDNS_ADDRESS,
				);
			}
		}, ANNOUNCE_INTERVAL_MS);
	}

	async finish(): Promise<void> {
		if (this._hasPaired) {
			this._core.service.credentials = `0x${this._pairingGuid}`;
			this._core.settings.protocols.dmap.credentials =
				this._core.service.credentials;
		}
	}

	async close(): Promise<void> {
		if (this._announceTimer) {
			clearInterval(this._announceTimer);
			this._announceTimer = null;
		}
		if (this._mdnsSocket) {
			this._mdnsSocket.close();
			this._mdnsSocket = null;
		}
		if (this._server) {
			this._server.close();
			this._server = null;
		}
	}

	handleRequest(_serviceName: string, receivedCode: string): Buffer | null {
		const code = receivedCode.toLowerCase();

		if (this._verifyPin(code)) {
			const cmpg = tags.uint64Tag("cmpg", BigInt(`0x${this._pairingGuid}`));
			const cmnm = tags.stringTag("cmnm", this._name);
			const cmty = tags.stringTag("cmty", "iPhone");
			const response = tags.containerTag(
				"cmpa",
				Buffer.concat([cmpg, cmnm, cmty]),
			);
			this._hasPaired = true;
			return response;
		}

		return null;
	}

	_buildMdnsPacket(localIp: string, hostname: string): DnsMessage {
		const serviceType = "_touch-remote._tcp.local";
		const instanceName = `${this._name}.${serviceType}`;

		const msg = new DnsMessage(0, 0x8400); // Standard mDNS response flags

		// PTR record: service type → instance name
		msg.answers.push({
			qname: serviceType,
			qtype: QueryType.PTR,
			qclass: 0x0001,
			ttl: 4500,
			rdLength: 0,
			rd: instanceName,
		});

		// SRV record: instance → host + port (packed as raw bytes in resources)
		const srvRd = this._buildSrvRdata(0, 0, this._serverPort, hostname);
		msg.resources.push({
			qname: instanceName,
			qtype: QueryType.SRV,
			qclass: 0x8001, // Cache-flush flag
			ttl: 4500,
			rdLength: srvRd.length,
			rd: srvRd,
		});

		// TXT record: instance → properties
		const txtRd = formatTxtDict({
			DvNm: this._name,
			RemV: "10000",
			DvTy: "iPod",
			RemN: "Remote",
			Pair: this._pairingGuid,
		});
		msg.resources.push({
			qname: instanceName,
			qtype: QueryType.TXT,
			qclass: 0x8001,
			ttl: 4500,
			rdLength: txtRd.length,
			rd: txtRd,
		});

		// A record: hostname → IP address
		const aRd = this._buildARecordRdata(localIp);
		msg.resources.push({
			qname: hostname,
			qtype: QueryType.A,
			qclass: 0x8001,
			ttl: 120,
			rdLength: aRd.length,
			rd: aRd,
		});

		return msg;
	}

	private _buildSrvRdata(
		priority: number,
		weight: number,
		port: number,
		target: string,
	): Buffer {
		const header = Buffer.alloc(6);
		header.writeUInt16BE(priority, 0);
		header.writeUInt16BE(weight, 2);
		header.writeUInt16BE(port, 4);
		const targetBuf = qnameEncode(target);
		return Buffer.concat([header, targetBuf]);
	}

	private _buildARecordRdata(ip: string): Buffer {
		const parts = ip.split(".").map(Number);
		return Buffer.from(parts);
	}

	private _verifyPin(receivedCode: string): boolean {
		if (this._pinCode === null) {
			return true;
		}

		let merged = this._pairingGuid;
		for (const char of String(this._pinCode).padStart(4, "0")) {
			merged += char;
			merged += "\x00";
		}

		const expectedCode = createHash("md5")
			.update(merged, "utf-8")
			.digest("hex");
		return receivedCode === expectedCode;
	}
}
