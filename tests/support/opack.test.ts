import { describe, expect, it } from "vitest";
import { pack, sizedInt, unpack } from "../../src/support/opack.js";

function h(hex: string): Buffer {
	return Buffer.from(hex.replace(/\s/g, ""), "hex");
}

describe("pack", () => {
	it("throws on unsupported type", () => {
		expect(() => pack(new Set())).toThrow(TypeError);
	});

	it("packs boolean", () => {
		expect(pack(true)).toEqual(h("01"));
		expect(pack(false)).toEqual(h("02"));
	});

	it("packs null", () => {
		expect(pack(null)).toEqual(h("04"));
	});

	it("packs UUID", () => {
		expect(pack("12345678-1234-5678-1234-567812345678")).toEqual(
			Buffer.concat([h("05"), h("12345678123456781234567812345678")]),
		);
	});

	it("packs small integers", () => {
		expect(pack(0)).toEqual(h("08"));
		expect(pack(0xf)).toEqual(h("17"));
		expect(pack(0x27)).toEqual(h("2f"));
	});

	it("packs larger integers", () => {
		expect(pack(0x28)).toEqual(h("3028"));
		expect(pack(0x1ff)).toEqual(h("31ff01"));
		expect(pack(0x1ffffff)).toEqual(h("32ffffff01"));
	});

	it("packs sized integers", () => {
		expect(pack(sizedInt(0x1, 1))).toEqual(h("3001"));
		expect(pack(sizedInt(0x1, 2))).toEqual(h("310100"));
		expect(pack(sizedInt(0x1, 4))).toEqual(h("3201000000"));
		expect(pack(sizedInt(0x1, 8))).toEqual(h("330100000000000000"));
	});

	it("packs float64", () => {
		// Note: 1.0 is integer in JS. Use 1.5 to test float packing.
		expect(pack(1.5)).toEqual(h("36000000000000f83f"));
	});

	it("packs short strings", () => {
		expect(pack("a")).toEqual(h("4161"));
		expect(pack("abc")).toEqual(h("43616263"));
		expect(pack("a".repeat(0x20))).toEqual(
			Buffer.concat([h("60"), Buffer.alloc(0x20, 0x61)]),
		);
	});

	it("packs longer strings", () => {
		expect(pack("a".repeat(33))).toEqual(
			Buffer.concat([h("6121"), Buffer.alloc(33, 0x61)]),
		);
		expect(pack("a".repeat(256))).toEqual(
			Buffer.concat([h("620001"), Buffer.alloc(256, 0x61)]),
		);
	});

	it("packs short raw bytes", () => {
		expect(pack(Buffer.from([0xac]))).toEqual(h("71ac"));
		expect(pack(Buffer.from([0x12, 0x34, 0x56]))).toEqual(h("73123456"));
		expect(pack(Buffer.alloc(0x20, 0xad))).toEqual(
			Buffer.concat([h("90"), Buffer.alloc(0x20, 0xad)]),
		);
	});

	it("packs longer raw bytes", () => {
		expect(pack(Buffer.alloc(33, 0x61))).toEqual(
			Buffer.concat([h("9121"), Buffer.alloc(33, 0x61)]),
		);
		expect(pack(Buffer.alloc(256, 0x61))).toEqual(
			Buffer.concat([h("920001"), Buffer.alloc(256, 0x61)]),
		);
		expect(pack(Buffer.alloc(65536, 0x61))).toEqual(
			Buffer.concat([h("9300000100"), Buffer.alloc(65536, 0x61)]),
		);
	});

	it("packs array", () => {
		expect(pack([])).toEqual(h("d0"));
		expect(pack([1, "test", false])).toEqual(h("d3094474657374 02"));
		expect(pack([[true]])).toEqual(h("d1d101"));
	});

	it("packs endless array", () => {
		const arr = Array(15).fill("a");
		const expected = Buffer.concat([
			h("df4161"),
			Buffer.alloc(14, 0xa0),
			h("03"),
		]);
		expect(pack(arr)).toEqual(expected);
	});

	it("packs dict", () => {
		expect(pack({})).toEqual(h("e0"));
		// JS objects only have string keys, so test with string keys
		expect(pack({ a: 12 })).toEqual(h("e1416114"));
	});

	it("packs ptr", () => {
		expect(pack(["a", "a"])).toEqual(h("d24161a0"));
		expect(pack(["foo", "bar", "foo", "bar"])).toEqual(
			h("d443666f6f43626172a0a1"),
		);
	});
});

describe("unpack", () => {
	it("throws on unsupported type", () => {
		expect(() => unpack(h("00"))).toThrow(TypeError);
	});

	it("unpacks boolean", () => {
		expect(unpack(h("01"))).toEqual([true, Buffer.alloc(0)]);
		expect(unpack(h("02"))).toEqual([false, Buffer.alloc(0)]);
	});

	it("unpacks null", () => {
		expect(unpack(h("04"))).toEqual([null, Buffer.alloc(0)]);
	});

	it("unpacks UUID", () => {
		const [value, remaining] = unpack(
			Buffer.concat([h("05"), h("12345678123456781234567812345678")]),
		);
		expect(value).toBe("12345678-1234-5678-1234-567812345678");
		expect(remaining).toEqual(Buffer.alloc(0));
	});

	it("unpacks absolute time as integer", () => {
		const [value] = unpack(h("060100000000000000"));
		expect(value).toBe(1);
	});

	it("unpacks small integers", () => {
		expect(unpack(h("08"))[0]).toBe(0);
		expect(unpack(h("17"))[0]).toBe(0xf);
		expect(unpack(h("2f"))[0]).toBe(0x27);
	});

	it("unpacks larger integers", () => {
		expect(Number(unpack(h("3028"))[0])).toBe(0x28);
		expect(Number(unpack(h("31ff01"))[0])).toBe(0x1ff);
		expect(Number(unpack(h("32ffffff01"))[0])).toBe(0x1ffffff);
	});

	it("unpacks sized integers with size attribute", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing internal structure
		expect((unpack(h("3001"))[0] as any).size).toBe(1);
		// biome-ignore lint/suspicious/noExplicitAny: testing internal structure
		expect((unpack(h("310100"))[0] as any).size).toBe(2);
		// biome-ignore lint/suspicious/noExplicitAny: testing internal structure
		expect((unpack(h("3201000000"))[0] as any).size).toBe(4);
		// biome-ignore lint/suspicious/noExplicitAny: testing internal structure
		expect((unpack(h("330100000000000000"))[0] as any).size).toBe(8);
	});

	it("unpacks float32", () => {
		const [value] = unpack(h("350000803f"));
		expect(value).toBeCloseTo(1.0);
	});

	it("unpacks float64", () => {
		const [value] = unpack(h("36000000000000f03f"));
		expect(value).toBe(1.0);
	});

	it("unpacks short strings", () => {
		expect(unpack(h("4161"))[0]).toBe("a");
		expect(unpack(h("43616263"))[0]).toBe("abc");
		expect(unpack(Buffer.concat([h("60"), Buffer.alloc(0x20, 0x61)]))[0]).toBe(
			"a".repeat(0x20),
		);
	});

	it("unpacks longer strings", () => {
		expect(unpack(Buffer.concat([h("6121"), Buffer.alloc(33, 0x61)]))[0]).toBe(
			"a".repeat(33),
		);
		expect(
			unpack(Buffer.concat([h("620001"), Buffer.alloc(256, 0x61)]))[0],
		).toBe("a".repeat(256));
	});

	it("unpacks short raw bytes", () => {
		expect(unpack(h("71ac"))[0]).toEqual(Buffer.from([0xac]));
		expect(unpack(h("73123456"))[0]).toEqual(Buffer.from([0x12, 0x34, 0x56]));
		expect(
			unpack(Buffer.concat([h("90"), Buffer.alloc(0x20, 0xad)]))[0],
		).toEqual(Buffer.alloc(0x20, 0xad));
	});

	it("unpacks longer raw bytes", () => {
		expect(
			unpack(Buffer.concat([h("9121"), Buffer.alloc(33, 0x61)]))[0],
		).toEqual(Buffer.alloc(33, 0x61));
		expect(
			unpack(Buffer.concat([h("920001"), Buffer.alloc(256, 0x61)]))[0],
		).toEqual(Buffer.alloc(256, 0x61));
		expect(
			unpack(Buffer.concat([h("9300000100"), Buffer.alloc(65536, 0x61)]))[0],
		).toEqual(Buffer.alloc(65536, 0x61));
	});

	it("unpacks array", () => {
		expect(unpack(h("d0"))[0]).toEqual([]);
		const [arr] = unpack(h("d309447465737402"));
		expect(arr).toEqual([1, "test", false]);
		expect(unpack(h("d1d101"))[0]).toEqual([[true]]);
	});

	it("unpacks endless array", () => {
		const list1 = Buffer.concat([h("df4161"), Buffer.alloc(15, 0xa0), h("03")]);
		const [value] = unpack(list1);
		expect(value).toEqual(Array(16).fill("a"));
	});

	it("unpacks dict", () => {
		expect(unpack(h("e0"))[0]).toEqual({});
	});

	it("unpacks ptr", () => {
		expect(unpack(h("d24161a0"))[0]).toEqual(["a", "a"]);
		expect(unpack(h("d443666f6f43626172a0a1"))[0]).toEqual([
			"foo",
			"bar",
			"foo",
			"bar",
		]);
	});

	it("unpacks uid references", () => {
		const [v1] = unpack(h("df300130 02c10103"));
		expect((v1 as number[]).map(Number)).toEqual([1, 2, 2]);
		const [v2] = unpack(h("df300130 02c2010003"));
		expect((v2 as number[]).map(Number)).toEqual([1, 2, 2]);
		const [v3] = unpack(h("df300130 02c301000003"));
		expect((v3 as number[]).map(Number)).toEqual([1, 2, 2]);
		const [v4] = unpack(h("df300130 02c40100000003"));
		expect((v4 as number[]).map(Number)).toEqual([1, 2, 2]);
	});
});

describe("pack/unpack roundtrip", () => {
	it("roundtrips golden data", () => {
		const data: Record<string, unknown> = {
			_i: "_systemInfo",
			_x: 1254122577,
			_btHP: false,
			_c: {
				_pubID: "AA:BB:CC:DD:EE:FF",
				_sv: "230.1",
				_bf: 0,
				_siriInfo: {
					collectorElectionVersion: 1.5,
					deviceCapabilities: {
						seymourEnabled: 1,
						voiceTriggerEnabled: 2,
					},
					sharedDataProtoBuf: Buffer.alloc(512, 0x08),
				},
				_stA: [
					"com.apple.LiveAudio",
					"com.apple.siri.wakeup",
					"com.apple.Seymour",
					"com.apple.announce",
					"com.apple.coreduet.sync",
					"com.apple.SeymourSession",
				],
				_i: "6c62fca18b11",
				_clFl: 128,
				_idsID: "44E14ABC-DDDD-4188-B661-11BAAAF6ECDE",
				_hkUID: ["17ed160a-81f8-4488-962c-6b1a83eb0081"],
				_dC: "1",
				_sf: 256,
				model: "iPhone10,6",
				name: "iPhone",
			},
			_t: 2,
		};

		const packed = pack(data);
		const [unpacked] = unpack(packed);

		const result = unpacked as Record<string, unknown>;
		expect(result._i).toBe("_systemInfo");
		expect(result._btHP).toBe(false);
		const c = result._c as Record<string, unknown>;
		expect(c._pubID).toBe("AA:BB:CC:DD:EE:FF");
		expect(c._sv).toBe("230.1");
		expect((c._stA as string[]).length).toBe(6);
		expect((c._hkUID as string[])[0]).toBe(
			"17ed160a-81f8-4488-962c-6b1a83eb0081",
		);
	});
});
