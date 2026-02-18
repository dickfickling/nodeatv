/**
 * Parser and data extractor for raw DMAP data.
 *
 * DMAP is basically TLV where the key is a 4 byte ASCII value,
 * a four byte big endian unsigned int as length and the data as data.
 */

import { InvalidDmapDataError } from "../../exceptions.js";
import { readBplist, readStr, readUint, type TagReader } from "./tags.js";

export interface DmapTag {
	type: TagReader | "container";
	name: string;
}

export function createDmapTag(
	type: TagReader | "container",
	name: string,
): DmapTag {
	return { type, name };
}

export type TagLookup = (name: string) => DmapTag;
export type DmapData = Array<Record<string, unknown>>;

function _parse(
	data: Buffer,
	dataLen: number,
	tagLookup: TagLookup,
	pos: number,
	ctx: DmapData = [],
): DmapData {
	if (pos >= dataLen) {
		return ctx;
	}

	const fName = readStr(data, pos, 4);
	const fLen = readUint(data, pos + 4, 4);
	pos += 8;

	const tag = tagLookup(fName);
	if (tag.type === "container") {
		ctx.push({ [fName]: _parse(data, pos + fLen, tagLookup, pos, []) });
	} else {
		ctx.push({ [fName]: tag.type(data, pos, fLen) });
	}

	return _parse(data, dataLen, tagLookup, pos + fLen, ctx);
}

export function parse(data: Buffer, tagLookup: TagLookup): DmapData {
	return _parse(data, data.length, tagLookup, 0, []);
}

export function first(dmapData: unknown, ...path: string[]): unknown {
	if (!path.length || !Array.isArray(dmapData)) {
		return dmapData;
	}

	for (const key of dmapData) {
		if (path[0] in key) {
			return first(key[path[0]], ...path.slice(1));
		}
	}

	return null;
}

export function pprint(
	data: unknown,
	tagLookup: TagLookup,
	indent = 0,
): string {
	let output = "";

	if (data !== null && typeof data === "object" && !Array.isArray(data)) {
		for (const [key, value] of Object.entries(
			data as Record<string, unknown>,
		)) {
			const tag = tagLookup(key);
			if (
				typeof value === "object" &&
				value !== null &&
				tag.type !== readBplist
			) {
				output += `${" ".repeat(indent)}${key}: [${typeof tag.type === "string" ? tag.type : tag.type.name.slice(4)}, ${tag.name}]\n`;
				output += pprint(value, tagLookup, indent + 2);
			} else {
				output += `${" ".repeat(indent)}${key}: ${String(value)} [${typeof tag.type === "string" ? tag.type : tag.type.name.slice(4)}, ${tag.name}]\n`;
			}
		}
	} else if (Array.isArray(data)) {
		for (const elem of data) {
			output += pprint(elem, tagLookup, indent);
		}
	} else {
		throw new InvalidDmapDataError(`invalid dmap data: ${String(data)}`);
	}

	return output;
}
