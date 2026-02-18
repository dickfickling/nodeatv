import { describe, expect, it } from "vitest";
import {
	readTlv,
	stringify,
	TlvValue,
	writeTlv,
} from "../../src/auth/hapTlv8.js";

const SINGLE_KEY_IN = new Map([[10, Buffer.from("123")]]);
const SINGLE_KEY_OUT = Buffer.from([0x0a, 0x03, 0x31, 0x32, 0x33]);

const DOUBLE_KEY_IN = new Map([
	[1, Buffer.from("111")],
	[4, Buffer.from("222")],
]);
const DOUBLE_KEY_OUT = Buffer.from([
	0x01, 0x03, 0x31, 0x31, 0x31, 0x04, 0x03, 0x32, 0x32, 0x32,
]);

const LARGE_KEY_IN = new Map([[2, Buffer.alloc(256, 0x31)]]);
const LARGE_KEY_OUT = Buffer.concat([
	Buffer.from([0x02, 0xff]),
	Buffer.alloc(255, 0x31),
	Buffer.from([0x02, 0x01, 0x31]),
]);

describe("writeTlv", () => {
	it("writes single key", () => {
		expect(writeTlv(SINGLE_KEY_IN)).toEqual(SINGLE_KEY_OUT);
	});

	it("writes two keys", () => {
		expect(writeTlv(DOUBLE_KEY_IN)).toEqual(DOUBLE_KEY_OUT);
	});

	it("writes key larger than 255 bytes", () => {
		expect(writeTlv(LARGE_KEY_IN)).toEqual(LARGE_KEY_OUT);
	});
});

describe("readTlv", () => {
	it("reads single key", () => {
		const result = readTlv(SINGLE_KEY_OUT);
		expect(result.get(10)).toEqual(Buffer.from("123"));
	});

	it("reads two keys", () => {
		const result = readTlv(DOUBLE_KEY_OUT);
		expect(result.get(1)).toEqual(Buffer.from("111"));
		expect(result.get(4)).toEqual(Buffer.from("222"));
	});

	it("reads key larger than 255 bytes", () => {
		const result = readTlv(LARGE_KEY_OUT);
		expect(result.get(2)).toEqual(Buffer.alloc(256, 0x31));
	});
});

describe("stringify", () => {
	it("stringifies method", () => {
		expect(stringify(new Map([[TlvValue.Method, Buffer.from([0x00])]]))).toBe(
			"Method=PairSetup",
		);
		expect(stringify(new Map([[TlvValue.Method, Buffer.from([0x02])]]))).toBe(
			"Method=PairVerify",
		);
	});

	it("stringifies seqno", () => {
		expect(stringify(new Map([[TlvValue.SeqNo, Buffer.from([0x01])]]))).toBe(
			"SeqNo=M1",
		);
		expect(stringify(new Map([[TlvValue.SeqNo, Buffer.from([0x02])]]))).toBe(
			"SeqNo=M2",
		);
		expect(stringify(new Map([[TlvValue.SeqNo, Buffer.from([0x03])]]))).toBe(
			"SeqNo=M3",
		);
		expect(stringify(new Map([[TlvValue.SeqNo, Buffer.from([0x04])]]))).toBe(
			"SeqNo=M4",
		);
		expect(stringify(new Map([[TlvValue.SeqNo, Buffer.from([0x05])]]))).toBe(
			"SeqNo=M5",
		);
		expect(stringify(new Map([[TlvValue.SeqNo, Buffer.from([0x06])]]))).toBe(
			"SeqNo=M6",
		);
	});

	it("stringifies error", () => {
		expect(stringify(new Map([[TlvValue.Error, Buffer.from([0x02])]]))).toBe(
			"Error=Authentication",
		);
		expect(stringify(new Map([[TlvValue.Error, Buffer.from([0x05])]]))).toBe(
			"Error=MaxTries",
		);
	});

	it("stringifies backoff", () => {
		expect(
			stringify(new Map([[TlvValue.BackOff, Buffer.from([0x02, 0x00])]])),
		).toBe("BackOff=2s");
	});

	it("stringifies remaining as byte length", () => {
		const values = [
			TlvValue.Identifier,
			TlvValue.Salt,
			TlvValue.PublicKey,
			TlvValue.Proof,
			TlvValue.EncryptedData,
			TlvValue.Certificate,
			TlvValue.Signature,
			TlvValue.Permissions,
			TlvValue.FragmentData,
			TlvValue.FragmentLast,
		];
		for (const value of values) {
			const result = stringify(
				new Map([[value, Buffer.from([0x00, 0x01, 0x02, 0x03])]]),
			);
			expect(result).toMatch(/=4bytes$/);
		}
	});

	it("stringifies multiple", () => {
		const data = new Map<number, Buffer>([
			[TlvValue.Method, Buffer.from([0x00])],
			[TlvValue.SeqNo, Buffer.from([0x01])],
			[TlvValue.Error, Buffer.from([0x03])],
			[TlvValue.BackOff, Buffer.from([0x01, 0x00])],
		]);
		expect(stringify(data)).toBe(
			"Method=PairSetup, SeqNo=M1, Error=BackOff, BackOff=1s",
		);
	});

	it("stringifies unknown values", () => {
		const data = new Map<number, Buffer>([
			[TlvValue.Method, Buffer.from([0xaa])],
			[TlvValue.SeqNo, Buffer.from([0xab])],
			[TlvValue.Error, Buffer.from([0xac])],
			[0xad, Buffer.from([0x01, 0x02, 0x03])],
		]);
		expect(stringify(data)).toBe(
			"Method=0xaa, SeqNo=0xab, Error=0xac, 0xad=3bytes",
		);
	});
});
