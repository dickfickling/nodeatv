/**
 * Fake DNS server for testing.
 * Port of pyatv/tests/fake_udns.py
 */

import {
	DnsMessage,
	formatTxtDict,
	QueryType,
	qnameEncode,
} from "../src/support/dns.js";
import * as dnsUtils from "./support/dnsUtils.js";

export interface FakeDnsService {
	name: string;
	port: number;
	properties: Record<string, string>;
	addresses: string[];
	model?: string;
}

function srvRdata(
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

export function mrpService(
	serviceName: string,
	name: string,
	identifier: string,
	options?: { addresses?: string[]; port?: number },
): [string, FakeDnsService] {
	const addresses = options?.addresses ?? ["127.0.0.1"];
	const port = options?.port ?? 49152;
	return [
		"_mediaremotetv._tcp.local",
		{
			name: serviceName,
			port,
			properties: {
				Name: name,
				UniqueIdentifier: identifier,
			},
			addresses,
		},
	];
}

export function airplayService(
	serviceName: string,
	deviceId: string,
	options?: { addresses?: string[]; port?: number },
): [string, FakeDnsService] {
	const addresses = options?.addresses ?? ["127.0.0.1"];
	const port = options?.port ?? 7000;
	return [
		"_airplay._tcp.local",
		{
			name: serviceName,
			port,
			properties: { deviceid: deviceId },
			addresses,
		},
	];
}

export function createResponse(
	requestBytes: Buffer,
	services: Record<string, FakeDnsService>,
): DnsMessage {
	const request = new DnsMessage().unpack(requestBytes);
	const response = new DnsMessage(request.msgId, 0x8400);

	// Echo back questions
	response.questions = [...request.questions];

	for (const question of request.questions) {
		const service = services[question.qname];
		if (!service) continue;

		const fullName = `${service.name}.${question.qname}`;
		const hostName = `${service.name}.local`;

		// PTR answer
		response.answers.push({
			qname: question.qname,
			qtype: QueryType.PTR,
			qclass: dnsUtils.DEFAULT_QCLASS,
			ttl: dnsUtils.DEFAULT_TTL,
			rdLength: 0,
			rd: fullName,
		});

		// SRV resource
		const srvData = srvRdata(0, 0, service.port, hostName);
		response.resources.push({
			qname: fullName,
			qtype: QueryType.SRV,
			qclass: dnsUtils.DEFAULT_QCLASS,
			ttl: dnsUtils.DEFAULT_TTL,
			rdLength: srvData.length,
			rd: srvData,
		});

		// TXT resource
		const txtData = formatTxtDict(service.properties);
		response.resources.push({
			qname: fullName,
			qtype: QueryType.TXT,
			qclass: dnsUtils.DEFAULT_QCLASS,
			ttl: dnsUtils.DEFAULT_TTL,
			rdLength: txtData.length,
			rd: txtData,
		});

		// A records
		for (const addr of service.addresses) {
			const parts = addr.split(".").map(Number);
			const aBuf = Buffer.from(parts);
			response.resources.push({
				qname: hostName,
				qtype: QueryType.A,
				qclass: dnsUtils.DEFAULT_QCLASS,
				ttl: dnsUtils.DEFAULT_TTL,
				rdLength: aBuf.length,
				rd: aBuf,
			});
		}
	}

	return response;
}
