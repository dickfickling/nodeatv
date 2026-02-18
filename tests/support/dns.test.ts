import { describe, expect, it } from "vitest";
import {
	BufferReader,
	formatTxtDict,
	parseDomainName,
	parseRdata,
	parseString,
	parseTxtDict,
	QueryType,
	qnameEncode,
	ServiceInstanceName,
} from "../../src/support/dns.js";

// --- ServiceInstanceName tests ---

describe("ServiceInstanceName", () => {
	it.each([
		{
			id: "ptr",
			name: "_http._tcp.local",
			expected: [null, "_http._tcp", "local"] as const,
		},
		{
			id: "no_dot",
			name: "foo._http._tcp.local",
			expected: ["foo", "_http._tcp", "local"] as const,
		},
		{
			id: "with_dot",
			name: "foo.bar._http._tcp.local",
			expected: ["foo.bar", "_http._tcp", "local"] as const,
		},
	])("happy path: $id", ({ name, expected }) => {
		const result = ServiceInstanceName.splitName(name);
		expect(result.toTuple()).toEqual(expected);
	});

	it.each([
		{ id: "no_proto", name: "_http.local" },
		{ id: "no_service", name: "._tcp.local" },
		{ id: "split", name: "_http.foo._tcp.local" },
		{ id: "reversed", name: "_tcp._http.local" },
	])("sad path: $id", ({ name }) => {
		expect(() => ServiceInstanceName.splitName(name)).toThrow();
	});
});

// --- qnameEncode tests ---

describe("qnameEncode", () => {
	const encodeCases: Record<string, [string | string[], Buffer]> = {
		root: [".", Buffer.from([0x00])],
		empty: ["", Buffer.from([0x00])],
		"example.com": [
			"example.com",
			Buffer.from("\x07example\x03com\x00", "binary"),
		],
		example_com_list: [
			["example", "com"],
			Buffer.from("\x07example\x03com\x00", "binary"),
		],
		unicode: [
			"Bücher.example",
			Buffer.from(
				Buffer.concat([
					Buffer.from([0x07]),
					Buffer.from("Bücher", "utf-8"),
					Buffer.from([0x07]),
					Buffer.from("example"),
					Buffer.from([0x00]),
				]),
			),
		],
		dotted_instance: [
			"Dot.Within._http._tcp.example.local",
			Buffer.from(
				"\x0aDot.Within\x05_http\x04_tcp\x07example\x05local\x00",
				"binary",
			),
		],
		dotted_instance_list: [
			["Dot.Within", "_http", "_tcp", "example", "local"],
			Buffer.from(
				"\x0aDot.Within\x05_http\x04_tcp\x07example\x05local\x00",
				"binary",
			),
		],
		truncated_ascii: [
			"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.test",
			Buffer.concat([
				Buffer.from([0x3f]),
				Buffer.from(
					"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk",
				),
				Buffer.from([0x04]),
				Buffer.from("test"),
				Buffer.from([0x00]),
			]),
		],
		truncated_unicode: [
			"aがあいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめも.test",
			Buffer.concat([
				Buffer.from([0x3d]),
				Buffer.from("aがあいうえおかきくけこさしすせそたちつて", "utf-8"),
				Buffer.from([0x04]),
				Buffer.from("test"),
				Buffer.from([0x00]),
			]),
		],
	};

	for (const [id, [name, expected]] of Object.entries(encodeCases)) {
		it(`encodes ${id}`, () => {
			expect(qnameEncode(name)).toEqual(expected);
		});
	}
});

// --- parseDomainName tests ---

describe("parseDomainName", () => {
	const decodeCases: Record<string, [Buffer, number, string, number | null]> = {
		simple: [
			Buffer.from("\x03foo\x07example\x03com\x00", "binary"),
			0,
			"foo.example.com",
			null,
		],
		null: [Buffer.from([0x00]), 0, "", null],
		compressed: [
			Buffer.from("aaaa\x04test\x00\x05label\xc0\x04\xab\xcd", "binary"),
			10,
			"label.test",
			-2,
		],
		multi_compressed: [
			Buffer.from(
				"aaaa\x04test\x00\x05label\xc0\x04\x03foo\xc0\x0a\xab\xcd",
				"binary",
			),
			18,
			"foo.label.test",
			-2,
		],
		idna: [
			Buffer.from("\x0dxn--bcher-kva\x07example\x00", "binary"),
			0,
			"bücher.example",
			null,
		],
		nbsp: [
			Buffer.from(
				Buffer.concat([
					Buffer.from([0x10]),
					Buffer.from("Apple\xc2\xa0TV (4167)", "binary"),
					Buffer.from("\x05local\x00", "binary"),
				]),
			),
			0,
			"Apple\u00a0TV (4167).local",
			null,
		],
		unicode: [
			Buffer.concat([
				Buffer.from([0x1d]),
				Buffer.from(
					// "居間 Apple\u00a0TV. En Español" in UTF-8
					"居間 Apple\u00a0TV. En Español",
					"utf-8",
				),
				Buffer.from([0x05]),
				Buffer.from("local"),
				Buffer.from([0x00]),
			]),
			0,
			"居間 Apple\u00a0TV. En Español.local",
			null,
		],
	};

	for (const [
		id,
		[rawName, offset, expectedName, expectedOffset],
	] of Object.entries(decodeCases)) {
		it(`parses ${id}`, () => {
			const reader = new BufferReader(rawName, offset);
			const name = parseDomainName(reader);
			expect(name).toBe(expectedName);
			if (expectedOffset === null) {
				expect(reader.tell()).toBe(rawName.length);
			} else {
				const rawLen = rawName.length;
				expect(reader.tell()).toBe((rawLen + expectedOffset) % rawLen);
			}
		});
	}
});

// --- parseString tests ---

describe("parseString", () => {
	const stringCases: Record<string, [Buffer, Buffer, number | null]> = {
		null: [Buffer.from([0x00]), Buffer.alloc(0), null],
		len_63: [
			Buffer.concat([Buffer.from([0x3f]), Buffer.alloc(63, 0x30)]),
			Buffer.alloc(63, 0x30),
			null,
		],
		len_64: [
			Buffer.concat([Buffer.from([0x40]), Buffer.alloc(64, 0x30)]),
			Buffer.alloc(64, 0x30),
			null,
		],
		len_128: [
			Buffer.concat([Buffer.from([0x80]), Buffer.alloc(128, 0x30)]),
			Buffer.alloc(128, 0x30),
			null,
		],
		len_192: [
			Buffer.concat([Buffer.from([0xc0]), Buffer.alloc(192, 0x30)]),
			Buffer.alloc(192, 0x30),
			null,
		],
		len_255: [
			Buffer.concat([Buffer.from([0xff]), Buffer.alloc(255, 0x30)]),
			Buffer.alloc(255, 0x30),
			null,
		],
		trailing: [
			Buffer.concat([
				Buffer.from([0x0a]),
				Buffer.alloc(10, 0x32),
				Buffer.alloc(17, 0x39),
			]),
			Buffer.alloc(10, 0x32),
			-17,
		],
	};

	for (const [
		id,
		[encodedData, expectedData, expectedOffset],
	] of Object.entries(stringCases)) {
		it(`parses ${id}`, () => {
			const reader = new BufferReader(encodedData);
			const result = parseString(reader);
			expect(result).toEqual(expectedData);
			if (expectedOffset === null) {
				expect(reader.tell()).toBe(encodedData.length);
			} else {
				const dataLen = encodedData.length;
				expect(reader.tell()).toBe((dataLen + expectedOffset) % dataLen);
			}
		});
	}
});

// --- TXT record tests ---

describe("parseTxtDict", () => {
	it("parses single key-value", () => {
		const data = Buffer.from("\x07foo=bar", "binary");
		const extraData = Buffer.concat([
			data,
			Buffer.from([
				0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef,
			]),
		]);
		const reader = new BufferReader(extraData);
		const txtDict = parseTxtDict(reader, data.length);
		expect(reader.tell()).toBe(data.length);
		expect(txtDict.get("foo")).toEqual(Buffer.from("bar"));
	});

	it("parses multiple key-values", () => {
		const data = Buffer.from("\x07foo=bar\x09spam=eggs", "binary");
		const extraData = Buffer.concat([
			data,
			Buffer.from([0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef]),
		]);
		const reader = new BufferReader(extraData);
		const txtDict = parseTxtDict(reader, data.length);
		expect(reader.tell()).toBe(data.length);
		expect(txtDict.get("foo")).toEqual(Buffer.from("bar"));
		expect(txtDict.get("spam")).toEqual(Buffer.from("eggs"));
	});

	it("parses binary value", () => {
		const data = Buffer.from([0x06, 0x66, 0x6f, 0x6f, 0x3d, 0xfe, 0xed]);
		const extraData = Buffer.concat([
			data,
			Buffer.from([
				0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef,
			]),
		]);
		const reader = new BufferReader(extraData);
		const txtDict = parseTxtDict(reader, data.length);
		expect(reader.tell()).toBe(data.length);
		expect(txtDict.get("foo")).toEqual(Buffer.from([0xfe, 0xed]));
	});

	it("parses long value", () => {
		const cafeBuf = Buffer.alloc(200);
		for (let i = 0; i < 200; i += 2) {
			cafeBuf[i] = 0xca;
			cafeBuf[i + 1] = 0xfe;
		}
		const entry = Buffer.concat([Buffer.from("foo="), cafeBuf]);
		const data = Buffer.concat([Buffer.from([entry.length]), entry]);
		const extraData = Buffer.concat([
			data,
			Buffer.from([
				0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef,
			]),
		]);
		const reader = new BufferReader(extraData);
		const txtDict = parseTxtDict(reader, data.length);
		expect(reader.tell()).toBe(data.length);
		expect(txtDict.get("foo")).toEqual(cafeBuf);
	});
});

describe("formatTxtDict", () => {
	it.each([
		{
			data: { foo: "bar" },
			expected: Buffer.from("\x07foo=bar", "binary"),
		},
		{
			data: { foo: "bar", spam: "eggs" },
			expected: Buffer.from("\x07foo=bar\x09spam=eggs", "binary"),
		},
	])("formats TXT dict correctly", ({ data, expected }) => {
		expect(formatTxtDict(data)).toEqual(expected);
	});
});

// --- parseRdata tests ---

describe("parseRdata", () => {
	it("parses A record", () => {
		const data = Buffer.from([0x0a, 0x00, 0x00, 0x2a]);
		const reader = new BufferReader(data);
		expect(parseRdata(QueryType.A, reader, data.length)).toBe("10.0.0.42");
		expect(reader.tell()).toBe(data.length);
	});

	it("parses PTR record", () => {
		const data = Buffer.from("\x03foo\x07example\x03com\x00", "binary");
		const reader = new BufferReader(data);
		expect(parseRdata(QueryType.PTR, reader, data.length)).toBe(
			"foo.example.com",
		);
		expect(reader.tell()).toBe(data.length);
	});

	it("parses TXT record", () => {
		const data = Buffer.from("\x07foo=bar", "binary");
		const reader = new BufferReader(data);
		const result = parseRdata(QueryType.TXT, reader, data.length) as Map<
			string,
			Buffer
		>;
		expect(result.get("foo")).toEqual(Buffer.from("bar"));
		expect(reader.tell()).toBe(data.length);
	});

	it("parses SRV record", () => {
		const data = Buffer.from(
			"\x00\x0a\x00\x00\x00\x50\x03foo\x07example\x03com\x00",
			"binary",
		);
		const reader = new BufferReader(data);
		expect(parseRdata(QueryType.SRV, reader, data.length)).toEqual({
			priority: 10,
			weight: 0,
			port: 80,
			target: "foo.example.com",
		});
		expect(reader.tell()).toBe(data.length);
	});
});
