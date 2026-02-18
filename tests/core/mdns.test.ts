/**
 * Tests for core/mdns module.
 */

import { describe, expect, it } from "vitest";
import {
	createServiceQueries,
	type Service,
	ServiceParser,
} from "../../src/core/mdns.js";
import { DnsMessage, QueryType } from "../../src/support/dns.js";
import * as fakeUdns from "../fakeUdns.js";
import * as dnsUtils from "../support/dnsUtils.js";

const SERVICE_NAME = "Kitchen";
const MEDIAREMOTE_SERVICE = "_mediaremotetv._tcp.local";

const TEST_SERVICES: Record<string, fakeUdns.FakeDnsService> =
	Object.fromEntries([
		fakeUdns.mrpService(SERVICE_NAME, SERVICE_NAME, "mrp_id", {
			addresses: ["127.0.0.1"],
			port: 1234,
		}),
	]);

function getResponseForService(
	service: string,
): [DnsMessage, fakeUdns.FakeDnsService | undefined] {
	const req = createServiceQueries([service], QueryType.PTR)[0];
	const resp = fakeUdns.createResponse(req, TEST_SERVICES);
	return [new DnsMessage().unpack(resp.pack()), TEST_SERVICES[service]];
}

function parseServices(message: DnsMessage): Service[] {
	const parser = new ServiceParser();
	parser.addMessage(message);
	return parser.parse();
}

describe("mdns", () => {
	it("non-existing service returns no answers", () => {
		const [resp] = getResponseForService("_missing");
		expect(resp.questions.length).toBe(2);
		expect(resp.answers.length).toBe(0);
		expect(resp.resources.length).toBe(0);
	});

	it("service has expected responses", () => {
		const [resp] = getResponseForService(MEDIAREMOTE_SERVICE);
		expect(resp.questions.length).toBe(2);
		expect(resp.answers.length).toBe(1);
		expect(resp.resources.length).toBe(3);
	});

	it("service has valid question", () => {
		const [resp] = getResponseForService(MEDIAREMOTE_SERVICE);
		const question = resp.questions[0];
		expect(question.qname).toBe(MEDIAREMOTE_SERVICE);
		expect(question.qtype).toBe(QueryType.PTR);
		expect(question.qclass).toBe(0x8001);
	});

	it("service has valid answer", () => {
		const [resp, data] = getResponseForService(MEDIAREMOTE_SERVICE);
		const answerRec = resp.answers[0];
		expect(answerRec.qname).toBe(MEDIAREMOTE_SERVICE);
		expect(answerRec.qtype).toBe(QueryType.PTR);
		expect(answerRec.qclass).toBe(dnsUtils.DEFAULT_QCLASS);
		expect(answerRec.ttl).toBe(dnsUtils.DEFAULT_TTL);
		expect(answerRec.rd).toBe(`${data?.name}.${MEDIAREMOTE_SERVICE}`);
	});

	it("service has valid SRV resource", () => {
		const [resp, data] = getResponseForService(MEDIAREMOTE_SERVICE);
		const srv = dnsUtils.getQtype(resp.resources, QueryType.SRV);
		expect(srv.qname).toBe(`${data?.name}.${MEDIAREMOTE_SERVICE}`);
		expect(srv.qtype).toBe(QueryType.SRV);
		expect(srv.qclass).toBe(dnsUtils.DEFAULT_QCLASS);
		expect(srv.ttl).toBe(dnsUtils.DEFAULT_TTL);

		const rd = srv.rd as Record<string, unknown>;
		expect(rd.priority).toBe(0);
		expect(rd.weight).toBe(0);
		expect(rd.port).toBe(data?.port);
		expect(rd.target).toBe(`${data?.name}.local`);
	});

	it("service has valid TXT resource", () => {
		const [resp, data] = getResponseForService(MEDIAREMOTE_SERVICE);
		const txt = dnsUtils.getQtype(resp.resources, QueryType.TXT);
		expect(txt.qname).toBe(`${data?.name}.${MEDIAREMOTE_SERVICE}`);
		expect(txt.qtype).toBe(QueryType.TXT);

		const rd = txt.rd as Map<string, Buffer>;
		for (const [k, v] of Object.entries(data?.properties)) {
			expect(rd.get(k.toLowerCase())?.toString()).toBe(v);
		}
	});

	it("service has valid A resource", () => {
		const [resp, data] = getResponseForService(MEDIAREMOTE_SERVICE);
		const a = dnsUtils.getQtype(resp.resources, QueryType.A);
		expect(a.qname).toBe(`${data?.name}.local`);
		expect(a.qtype).toBe(QueryType.A);
		expect(a.qclass).toBe(dnsUtils.DEFAULT_QCLASS);
		expect(a.ttl).toBe(dnsUtils.DEFAULT_TTL);
		expect(a.rd).toBe("127.0.0.1");
	});

	it("authority roundtrip", () => {
		const msg = new DnsMessage();
		msg.authorities.push(
			dnsUtils.resource(
				"test.local",
				QueryType.A,
				Buffer.from([0x01, 0x02, 0x03, 0x04]),
			),
		);

		const unpacked = new DnsMessage().unpack(msg.pack());
		expect(unpacked.authorities.length).toBe(1);

		const record = unpacked.authorities[0];
		expect(record.qname).toBe("test.local");
		expect(record.qtype).toBe(QueryType.A);
		expect(record.qclass).toBe(dnsUtils.DEFAULT_QCLASS);
		expect(record.ttl).toBe(dnsUtils.DEFAULT_TTL);
		expect(record.rd).toBe("1.2.3.4");
	});
});

// --- ServiceParser tests ---

describe("ServiceParser", () => {
	it("parses empty service", () => {
		expect(parseServices(new DnsMessage())).toEqual([]);
	});

	it("parses no service type (no result)", () => {
		const message = dnsUtils.addService(
			new DnsMessage(),
			null,
			"service",
			[],
			0,
			{},
		);
		const parsed = parseServices(message);
		expect(parsed.length).toBe(0);
	});

	it("parses no service name (no result)", () => {
		const message = dnsUtils.addService(
			new DnsMessage(),
			"_abc._tcp.local",
			null,
			[],
			0,
			{},
		);
		expect(parseServices(message).length).toBe(0);
	});

	it("parses service with name and type", () => {
		const message = dnsUtils.addService(
			new DnsMessage(),
			"_abc._tcp.local",
			"service",
			[],
			0,
			{},
		);
		const parsed = parseServices(message);
		expect(parsed.length).toBe(1);
		dnsUtils.assertService(parsed[0], "_abc._tcp.local", "service", [], 0, {});
	});

	it("parses service with port and address", () => {
		const message = dnsUtils.addService(
			new DnsMessage(),
			"_abc._tcp.local",
			"service",
			["10.0.0.1"],
			123,
			{},
		);
		const parsed = parseServices(message);
		expect(parsed.length).toBe(1);
		dnsUtils.assertService(
			parsed[0],
			"_abc._tcp.local",
			"service",
			["10.0.0.1"],
			123,
			{},
		);
	});

	it("parses single service with properties", () => {
		const message = dnsUtils.addService(
			new DnsMessage(),
			"_abc._tcp.local",
			"service",
			["10.0.10.1"],
			123,
			{ foo: "bar" },
		);
		const parsed = parseServices(message);
		expect(parsed.length).toBe(1);
		dnsUtils.assertService(
			parsed[0],
			"_abc._tcp.local",
			"service",
			["10.0.10.1"],
			123,
			{ foo: "bar" },
		);
	});

	it("parses double service", () => {
		let message = dnsUtils.addService(
			new DnsMessage(),
			"_abc._tcp.local",
			"service1",
			["10.0.10.1"],
			123,
			{ foo: "bar" },
		);
		message = dnsUtils.addService(
			message,
			"_def._tcp.local",
			"service2",
			["10.0.10.2"],
			456,
			{ fizz: "buzz" },
		);
		const parsed = parseServices(message);
		expect(parsed.length).toBe(2);
		dnsUtils.assertService(
			parsed[0],
			"_abc._tcp.local",
			"service1",
			["10.0.10.1"],
			123,
			{ foo: "bar" },
		);
		dnsUtils.assertService(
			parsed[1],
			"_def._tcp.local",
			"service2",
			["10.0.10.2"],
			456,
			{ fizz: "buzz" },
		);
	});

	it("picks one available address", () => {
		const addresses = ["10.0.10.1", "10.0.10.2"];
		const message = dnsUtils.addService(
			new DnsMessage(),
			"_abc._tcp.local",
			"service",
			addresses,
			123,
			{ foo: "bar" },
		);
		const parsed = parseServices(message);
		expect(parsed.length).toBe(1);
		expect(addresses).toContain(parsed[0].address);
	});

	it("ignores link-local address", () => {
		const message = dnsUtils.addService(
			new DnsMessage(),
			"_abc._tcp.local",
			"service",
			["169.254.1.1"],
			123,
			{ foo: "bar" },
		);
		const parsed = parseServices(message);
		expect(parsed.length).toBe(1);
		expect(parsed[0].address).toBeNull();
	});

	it("properties convert keys to lower case", () => {
		const message = dnsUtils.addService(
			new DnsMessage(),
			"_abc._tcp.local",
			"service",
			[],
			0,
			{ FOO: "bar", Bar: "FOO" },
		);
		const parsed = parseServices(message);
		expect(parsed.length).toBe(1);
		expect(parsed[0].properties.foo).toBe("bar");
		expect(parsed[0].properties.bar).toBe("FOO");
	});

	it("ignores duplicate records", () => {
		const message = dnsUtils.addService(
			new DnsMessage(),
			"_abc._tcp.local",
			"service",
			[],
			0,
			{},
		);

		const parser = new ServiceParser();
		parser.addMessage(message);
		parser.addMessage(message);

		// One service should be present in the table
		expect(parser.table.size).toBe(1);

		// A single record should be there since duplicates are ignored
		const records = parser.table.get("service._abc._tcp.local")!;
		expect(records.has(QueryType.SRV)).toBe(true);
		expect(records.get(QueryType.SRV)?.length).toBe(1);
	});
});
