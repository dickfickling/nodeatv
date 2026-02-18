import { describe, expect, it } from "vitest";
import { first, parse, pprint } from "../../../src/protocols/dmap/parser.js";
import { lookupTag } from "../../../src/protocols/dmap/tagDefinitions.js";
import {
	containerTag,
	stringTag,
	uint8Tag,
	uint32Tag,
} from "../../../src/protocols/dmap/tags.js";

function buildDmapData(): Buffer {
	const inner = Buffer.concat([
		stringTag("cann", "TestTrack"),
		uint32Tag("cast", 180000),
		uint8Tag("caps", 4),
	]);
	return containerTag("cmst", inner);
}

describe("parse", () => {
	it("parses simple tag", () => {
		const data = uint32Tag("mstt", 200);
		const result = parse(data, lookupTag);
		expect(result).toHaveLength(1);
		expect(result[0].mstt).toBe(200);
	});

	it("parses container tag", () => {
		const data = buildDmapData();
		const result = parse(data, lookupTag);
		expect(result).toHaveLength(1);
		const cmst = result[0].cmst as Array<Record<string, unknown>>;
		expect(cmst).toHaveLength(3);
	});

	it("parses multiple tags", () => {
		const data = Buffer.concat([uint32Tag("mstt", 200), uint32Tag("msdc", 1)]);
		const result = parse(data, lookupTag);
		expect(result).toHaveLength(2);
		expect(result[0].mstt).toBe(200);
		expect(result[1].msdc).toBe(1);
	});
});

describe("first", () => {
	it("returns null for empty path", () => {
		expect(first([], "nonexistent")).toBeNull();
	});

	it("returns value at path", () => {
		const data = parse(buildDmapData(), lookupTag);
		expect(first(data, "cmst", "cann")).toBe("TestTrack");
		expect(first(data, "cmst", "cast")).toBe(180000);
		expect(first(data, "cmst", "caps")).toBe(4);
	});

	it("returns null for missing path", () => {
		const data = parse(buildDmapData(), lookupTag);
		expect(first(data, "cmst", "nonexistent")).toBeNull();
		expect(first(data, "nonexistent")).toBeNull();
	});
});

describe("pprint", () => {
	it("pretty prints parsed data", () => {
		const data = parse(uint32Tag("mstt", 200), lookupTag);
		const output = pprint(data, lookupTag);
		expect(output).toContain("mstt");
		expect(output).toContain("200");
	});

	it("pretty prints container", () => {
		const data = parse(buildDmapData(), lookupTag);
		const output = pprint(data, lookupTag);
		expect(output).toContain("cmst");
		expect(output).toContain("cann");
		expect(output).toContain("TestTrack");
	});
});
