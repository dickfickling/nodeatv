import bplistCreator from "bplist-creator";
import { describe, expect, it } from "vitest";
import { decodeBplistFromBody } from "../../src/support/http.js";
import type { HttpResponse } from "../../src/support/http.js";

function makeResponse(body: Buffer | string): HttpResponse {
	return {
		protocol: "HTTP",
		version: "1.1",
		code: 200,
		message: "OK",
		headers: {},
		body,
	};
}

describe("decodeBplistFromBody", () => {
	it("parses a real binary plist buffer", () => {
		const data = { name: "test", value: 42 };
		const bplistBuf = bplistCreator(data) as Buffer;

		const result = decodeBplistFromBody(makeResponse(bplistBuf));
		expect(result.name).toBe("test");
		expect(result.value).toBe(42);
	});

	it("falls back to JSON for non-bplist data", () => {
		const json = JSON.stringify({ hello: "world" });
		const result = decodeBplistFromBody(makeResponse(json));
		expect(result.hello).toBe("world");
	});

	it("falls back to JSON for Buffer containing JSON", () => {
		const jsonBuf = Buffer.from(JSON.stringify({ key: "val" }), "utf-8");
		const result = decodeBplistFromBody(makeResponse(jsonBuf));
		expect(result.key).toBe("val");
	});

	it("throws on completely invalid data", () => {
		const garbage = Buffer.from([0xff, 0xfe, 0xfd, 0x00, 0x01]);
		expect(() => decodeBplistFromBody(makeResponse(garbage))).toThrow();
	});

	it("throws when body is neither string nor Buffer", () => {
		const resp = makeResponse("");
		resp.body = { already: "parsed" };
		expect(() => decodeBplistFromBody(resp)).toThrow(
			"expected bytes or str",
		);
	});
});
