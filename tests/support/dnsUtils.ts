/**
 * Test utilities for DNS messages.
 * Port of pyatv/tests/support/dns_utils.py
 */

import { expect } from "vitest";
import type { Service } from "../../src/core/mdns.js";
import {
	type DnsMessage,
	DnsMessage as DnsMsg,
	type DnsResource,
	formatTxtDict,
	QueryType,
	qnameEncode,
} from "../../src/support/dns.js";

export const DEFAULT_QCLASS = 0x8001;
export const DEFAULT_TTL = 500;

export function answer(
	qname: string,
	rd: string,
	qclass = DEFAULT_QCLASS,
	ttl = DEFAULT_TTL,
): DnsResource {
	return {
		qname,
		qtype: QueryType.PTR,
		qclass,
		ttl,
		rdLength: 0, // will be computed when packing
		rd,
	};
}

export function resource(
	qname: string,
	qtype: QueryType,
	rd: Buffer | unknown,
	qclass = DEFAULT_QCLASS,
	ttl = DEFAULT_TTL,
): DnsResource {
	const rdBuf = Buffer.isBuffer(rd) ? rd : rd;
	return {
		qname,
		qtype,
		qclass,
		ttl,
		rdLength: Buffer.isBuffer(rdBuf) ? rdBuf.length : 0,
		rd: rdBuf,
	};
}

export function properties(props: Record<string, string>): Buffer {
	return formatTxtDict(props);
}

export function getQtype(
	resources: DnsResource[],
	qtype: QueryType,
): DnsResource {
	const found = resources.find((r) => r.qtype === qtype);
	if (!found) throw new Error(`No resource with qtype ${qtype}`);
	return found;
}

/** Build an SRV RDATA buffer. */
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

/**
 * Add a service definition to a DnsMessage.
 * Creates resources, then packs and unpacks to get parsed rd values.
 */
export function addService(
	message: DnsMessage,
	serviceType: string | null,
	name: string | null,
	addresses: string[],
	port: number,
	props: Record<string, string>,
): DnsMessage {
	if (!name) return message;

	const fullName = serviceType !== null ? `${name}.${serviceType}` : name;
	const hostName = `${name}.local`;

	// Build a temporary message with raw resources, pack, then unpack
	// to get properly parsed rd fields
	const tempMsg = new DnsMsg() as DnsMessage;

	// SRV record
	const srvData = srvRdata(0, 0, port, hostName);
	tempMsg.resources.push(resource(fullName, QueryType.SRV, srvData));

	// TXT record
	const txtData = formatTxtDict(props);
	tempMsg.resources.push(resource(fullName, QueryType.TXT, txtData));

	// A records for each address
	for (const addr of addresses) {
		const parts = addr.split(".").map(Number);
		const aBuf = Buffer.from(parts);
		tempMsg.resources.push(resource(hostName, QueryType.A, aBuf));
	}

	// Pack and unpack to get properly parsed rd values
	const packed = (tempMsg as DnsMsg).pack();
	const unpacked = new DnsMsg().unpack(packed);

	// Add the unpacked (properly parsed) resources to the original message
	message.resources.push(...unpacked.resources);

	return message;
}

/**
 * Assert service matches expected parameters.
 */
export function assertService(
	service: Service,
	serviceType: string | null,
	name: string | null,
	addresses: string[],
	port: number,
	props: Record<string, string>,
): void {
	if (serviceType) {
		expect(service.type).toBe(serviceType);
	}
	if (name) {
		expect(service.name).toBe(name);
	}
	if (addresses.length > 0) {
		expect(addresses).toContain(service.address);
	} else {
		expect(service.address).toBeNull();
	}
	expect(service.port).toBe(port);
	for (const [k, v] of Object.entries(props)) {
		expect(service.properties[k.toLowerCase()]).toBe(v);
	}
}
