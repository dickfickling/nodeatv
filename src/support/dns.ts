/**
 * Processing functions for raw DNS messages.
 */

import { CaseInsensitiveDict } from "./collections.js";

// --- Buffer stream helpers ---

class BufferReader {
	private _buf: Buffer;
	private _offset: number;

	constructor(buf: Buffer, offset = 0) {
		this._buf = buf;
		this._offset = offset;
	}

	get offset(): number {
		return this._offset;
	}

	set offset(value: number) {
		this._offset = value;
	}

	get remaining(): number {
		return this._buf.length - this._offset;
	}

	readUInt8(): number {
		const val = this._buf.readUInt8(this._offset);
		this._offset += 1;
		return val;
	}

	readUInt16BE(): number {
		const val = this._buf.readUInt16BE(this._offset);
		this._offset += 2;
		return val;
	}

	readUInt32BE(): number {
		const val = this._buf.readUInt32BE(this._offset);
		this._offset += 4;
		return val;
	}

	readBytes(length: number): Buffer {
		const val = this._buf.subarray(this._offset, this._offset + length);
		this._offset += length;
		return val;
	}

	seek(offset: number): void {
		this._offset = offset;
	}

	tell(): number {
		return this._offset;
	}
}

// --- ServiceInstanceName ---

export class ServiceInstanceName {
	readonly instance: string | null;
	readonly service: string;
	readonly domain: string;

	constructor(instance: string | null, service: string, domain = "local") {
		this.instance = instance;
		this.service = service;
		this.domain = domain;
	}

	toString(): string {
		return [this.instance, this.service, this.domain]
			.filter((x) => x != null && x !== "")
			.join(".");
	}

	static splitName(name: string): ServiceInstanceName {
		const labels = name.split(".");
		if (labels.length < 2) {
			throw new Error("There must be at least three labels in a service name");
		}
		for (let index = 0; index < labels.length - 1; index++) {
			const label = labels[index];
			const nextLabel = labels[index + 1];
			if (
				label.startsWith("_") &&
				(nextLabel.toLowerCase() === "_tcp" ||
					nextLabel.toLowerCase() === "_udp")
			) {
				const instanceParts = labels.slice(0, index);
				const instanceStr =
					instanceParts.length > 0 ? instanceParts.join(".") : null;
				return new ServiceInstanceName(
					instanceStr || null,
					`${label}.${nextLabel}`,
					labels.slice(index + 2).join("."),
				);
			}
		}
		throw new Error(
			`'${name}' is not a service domain, nor a service instance name`,
		);
	}

	get ptrName(): string {
		return `${this.service}.${this.domain}`;
	}

	/**
	 * Support equality comparison (used in tests).
	 * Returns [instance, service, domain] tuple for comparison.
	 */
	toTuple(): [string | null, string, string] {
		return [this.instance, this.service, this.domain];
	}
}

// --- DNS wire format functions ---

export function qnameEncode(name: string | string[]): Buffer {
	const encoded: number[] = [];
	let labels: string[];

	if (Array.isArray(name)) {
		labels = [...name];
	} else {
		// Try to parse as service instance name to handle dots in instance
		try {
			const srvName = ServiceInstanceName.splitName(name);
			labels = [];
			if (srvName.instance) {
				labels.push(srvName.instance);
			}
			labels.push(...srvName.ptrName.split("."));
		} catch {
			labels = name.split(".");
		}
	}

	// Ensure there's always an empty label for the root domain
	if (labels.length === 0 || labels[labels.length - 1] !== "") {
		labels.push("");
	}

	// NFC normalize each label
	for (let label of labels) {
		label = label.normalize("NFC");
		let encodedLabel = Buffer.from(label, "utf-8");
		let encodedLength = encodedLabel.length;

		// Truncate labels over 63 bytes, respecting multi-byte codepoints
		let truncatedStr = label;
		while (encodedLength > 63) {
			truncatedStr = truncatedStr.slice(0, -1);
			encodedLabel = Buffer.from(truncatedStr, "utf-8");
			encodedLength = encodedLabel.length;
		}

		encoded.push(encodedLength);
		if (encodedLength === 0) {
			break;
		}
		for (const byte of encodedLabel) {
			encoded.push(byte);
		}
	}

	return Buffer.from(encoded);
}

export function parseString(reader: BufferReader): Buffer {
	const chunkLength = reader.readUInt8();
	return reader.readBytes(chunkLength);
}

export function parseDomainName(reader: BufferReader): string {
	const labels: string[] = [];
	let compressionOffset: number | null = null;

	while (reader.remaining > 0) {
		const length = reader.readUInt8();
		if (length === 0) {
			break;
		}

		const lengthFlags = (length & 0xc0) >> 6;

		if (lengthFlags === 0b11) {
			// Name compression pointer
			const highBits = length & 0x3f;
			const lowByte = reader.readUInt8();
			const newOffset = (highBits << 8) | lowByte;

			if (compressionOffset === null) {
				compressionOffset = reader.tell();
			}
			reader.seek(newOffset);
		} else if (lengthFlags === 0) {
			const labelBytes = reader.readBytes(length);
			let decodedLabel: string;
			if (
				labelBytes.length >= 4 &&
				labelBytes.subarray(0, 4).toString("ascii") === "xn--"
			) {
				// IDNA encoded label
				decodedLabel = punycodeDecode(labelBytes.toString("ascii"));
			} else {
				decodedLabel = labelBytes.toString("utf-8");
			}
			labels.push(decodedLabel);
		}
	}

	if (compressionOffset !== null) {
		reader.seek(compressionOffset);
	}

	return labels.join(".");
}

/**
 * Decode a punycode/IDNA label (e.g., "xn--bcher-kva" -> "bücher").
 * Implements the Punycode bootstring algorithm (RFC 3492).
 */
function punycodeDecode(asciiLabel: string): string {
	const encoded = asciiLabel.slice(4); // strip "xn--"
	const BASE = 36;
	const TMIN = 1;
	const TMAX = 26;
	const SKEW = 38;
	const DAMP = 700;
	const INITIAL_BIAS = 72;
	const INITIAL_N = 128;

	function adapt(delta: number, numpoints: number, first: boolean): number {
		let d = first ? Math.floor(delta / DAMP) : delta >> 1;
		d += Math.floor(d / numpoints);
		let k = 0;
		while (d > ((BASE - TMIN) * TMAX) >> 1) {
			d = Math.floor(d / (BASE - TMIN));
			k += BASE;
		}
		return k + Math.floor(((BASE - TMIN + 1) * d) / (d + SKEW));
	}

	function basicToDigit(c: number): number {
		if (c >= 48 && c <= 57) return c - 22;
		if (c >= 65 && c <= 90) return c - 65;
		if (c >= 97 && c <= 122) return c - 97;
		return BASE;
	}

	const output: number[] = [];
	let i = 0;
	let n = INITIAL_N;
	let bias = INITIAL_BIAS;

	const basic = encoded.lastIndexOf("-");
	if (basic > 0) {
		for (let j = 0; j < basic; j++) {
			output.push(encoded.charCodeAt(j));
		}
	}

	let idx = basic > 0 ? basic + 1 : 0;
	while (idx < encoded.length) {
		const oldi = i;
		let w = 1;
		for (let k = BASE; ; k += BASE) {
			const digit = basicToDigit(encoded.charCodeAt(idx++));
			i += digit * w;
			const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
			if (digit < t) break;
			w *= BASE - t;
		}
		bias = adapt(i - oldi, output.length + 1, oldi === 0);
		n += Math.floor(i / (output.length + 1));
		i %= output.length + 1;
		output.splice(i, 0, n);
		i++;
	}

	return String.fromCodePoint(...output);
}

export function formatTxtDict(
	data: Record<string, string | Buffer | Uint8Array>,
): Buffer {
	const parts: Buffer[] = [];
	for (const [key, value] of Object.entries(data)) {
		const keyBuf = Buffer.from(key, "ascii");
		let valBuf: Buffer;
		if (Buffer.isBuffer(value)) {
			valBuf = value;
		} else if (value instanceof Uint8Array) {
			valBuf = Buffer.from(value);
		} else {
			valBuf = Buffer.from(value, "utf-8");
		}
		const entry = Buffer.concat([keyBuf, Buffer.from("="), valBuf]);
		const lengthBuf = Buffer.alloc(1);
		lengthBuf.writeUInt8(entry.length);
		parts.push(lengthBuf);
		parts.push(entry);
	}
	return Buffer.concat(parts);
}

export function parseTxtDict(
	reader: BufferReader,
	length: number,
): CaseInsensitiveDict<Buffer> {
	const output = new CaseInsensitiveDict<Buffer>();
	const stopPosition = reader.tell() + length;

	while (reader.tell() < stopPosition) {
		const chunk = parseString(reader);
		const eqIdx = chunk.indexOf(0x3d); // '='
		if (eqIdx === -1) {
			// No '=' means it's just present with no value
			const decodedChunk = chunk.toString("ascii");
			output.set(decodedChunk, Buffer.alloc(0));
		} else {
			const key = chunk.subarray(0, eqIdx);
			const value = chunk.subarray(eqIdx + 1);
			if (key.length === 0) {
				// Missing keys are skipped
				continue;
			}
			let decodedKey: string;
			try {
				decodedKey = key.toString("ascii");
			} catch {
				continue;
			}
			output.set(decodedKey, Buffer.from(value));
		}
	}
	return output;
}

export function parseSrvDict(
	reader: BufferReader,
): Record<string, number | string> {
	const priority = reader.readUInt16BE();
	const weight = reader.readUInt16BE();
	const port = reader.readUInt16BE();
	const target = parseDomainName(reader);

	return { priority, weight, port, target };
}

// --- QueryType ---

export enum QueryType {
	A = 0x01,
	PTR = 0x0c,
	TXT = 0x10,
	SRV = 0x21,
	ANY = 0xff,
}

export function parseRdata(
	qtype: QueryType,
	reader: BufferReader,
	length: number,
): unknown {
	if (qtype === QueryType.A) {
		if (length !== 4) {
			throw new Error(
				`An A record must have exactly 4 bytes of data (not ${length})`,
			);
		}
		const bytes = reader.readBytes(length);
		return `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
	}
	if (qtype === QueryType.PTR) {
		return parseDomainName(reader);
	}
	if (qtype === QueryType.TXT) {
		return parseTxtDict(reader, length);
	}
	if (qtype === QueryType.SRV) {
		return parseSrvDict(reader);
	}
	return reader.readBytes(length);
}

// --- DNS record types ---

export interface DnsHeader {
	id: number;
	flags: number;
	qdcount: number;
	ancount: number;
	nscount: number;
	arcount: number;
}

function unpackHeader(reader: BufferReader): DnsHeader {
	return {
		id: reader.readUInt16BE(),
		flags: reader.readUInt16BE(),
		qdcount: reader.readUInt16BE(),
		ancount: reader.readUInt16BE(),
		nscount: reader.readUInt16BE(),
		arcount: reader.readUInt16BE(),
	};
}

function packHeader(header: DnsHeader): Buffer {
	const buf = Buffer.alloc(12);
	buf.writeUInt16BE(header.id, 0);
	buf.writeUInt16BE(header.flags, 2);
	buf.writeUInt16BE(header.qdcount, 4);
	buf.writeUInt16BE(header.ancount, 6);
	buf.writeUInt16BE(header.nscount, 8);
	buf.writeUInt16BE(header.arcount, 10);
	return buf;
}

export interface DnsQuestion {
	qname: string;
	qtype: QueryType | number;
	qclass: number;
}

function unpackQuestion(reader: BufferReader): DnsQuestion {
	const qname = parseDomainName(reader);
	const qtype = reader.readUInt16BE();
	const qclass = reader.readUInt16BE();
	return { qname, qtype, qclass };
}

function packQuestion(question: DnsQuestion): Buffer {
	const nameBuf = qnameEncode(question.qname);
	const tail = Buffer.alloc(4);
	tail.writeUInt16BE(question.qtype, 0);
	tail.writeUInt16BE(question.qclass, 2);
	return Buffer.concat([nameBuf, tail]);
}

export interface DnsResource {
	qname: string;
	qtype: QueryType | number;
	qclass: number;
	ttl: number;
	rdLength: number;
	rd: unknown;
}

function unpackResource(reader: BufferReader): DnsResource {
	const qname = parseDomainName(reader);
	const qtype = reader.readUInt16BE();
	const qclass = reader.readUInt16BE();
	const ttl = reader.readUInt32BE();
	const rdLength = reader.readUInt16BE();
	const beforeRd = reader.tell();

	let rd: unknown;
	const validTypes = Object.values(QueryType).filter(
		(v) => typeof v === "number",
	) as number[];
	if (validTypes.includes(qtype)) {
		rd = parseRdata(qtype as QueryType, reader, rdLength);
	} else {
		rd = reader.readBytes(rdLength);
	}

	// Ensure we consumed exactly rdLength bytes
	const consumed = reader.tell() - beforeRd;
	if (consumed !== rdLength) {
		reader.seek(beforeRd + rdLength);
	}

	return { qname, qtype, qclass, ttl, rdLength, rd };
}

// --- DnsMessage ---

export class DnsMessage {
	msgId: number;
	flags: number;
	questions: DnsQuestion[];
	answers: DnsResource[];
	authorities: DnsResource[];
	resources: DnsResource[];

	constructor(msgId = 0, flags = 0x0120) {
		this.msgId = msgId;
		this.flags = flags;
		this.questions = [];
		this.answers = [];
		this.authorities = [];
		this.resources = [];
	}

	unpack(msg: Buffer): DnsMessage {
		const reader = new BufferReader(msg);

		const header = unpackHeader(reader);
		this.msgId = header.id;
		this.flags = header.flags;

		for (let i = 0; i < header.qdcount; i++) {
			this.questions.push(unpackQuestion(reader));
		}
		for (let i = 0; i < header.ancount; i++) {
			this.answers.push(unpackResource(reader));
		}
		for (let i = 0; i < header.nscount; i++) {
			this.authorities.push(unpackResource(reader));
		}
		for (let i = 0; i < header.arcount; i++) {
			this.resources.push(unpackResource(reader));
		}

		return this;
	}

	pack(): Buffer {
		const header = packHeader({
			id: this.msgId,
			flags: this.flags,
			qdcount: this.questions.length,
			ancount: this.answers.length,
			nscount: this.authorities.length,
			arcount: this.resources.length,
		});

		const parts: Buffer[] = [header];

		for (const question of this.questions) {
			parts.push(packQuestion(question));
		}

		// Pack answers (PTR-style: rd is a domain name that gets qname-encoded)
		for (const answer of this.answers) {
			const data = qnameEncode(answer.rd as string);
			const nameBuf = qnameEncode(answer.qname);
			const meta = Buffer.alloc(10);
			meta.writeUInt16BE(answer.qtype, 0);
			meta.writeUInt16BE(answer.qclass, 2);
			meta.writeUInt32BE(answer.ttl, 4);
			meta.writeUInt16BE(data.length, 8);
			parts.push(nameBuf, meta, data);
		}

		// Pack authorities and resources (rd is raw bytes)
		for (const section of [this.authorities, this.resources]) {
			for (const resource of section) {
				const nameBuf = qnameEncode(resource.qname);
				const rd = resource.rd as Buffer;
				const meta = Buffer.alloc(10);
				meta.writeUInt16BE(resource.qtype, 0);
				meta.writeUInt16BE(resource.qclass, 2);
				meta.writeUInt32BE(resource.ttl, 4);
				meta.writeUInt16BE(rd.length, 8);
				parts.push(nameBuf, meta, rd);
			}
		}

		return Buffer.concat(parts);
	}

	toString(): string {
		return (
			`MsgId=0x${this.msgId.toString(16).padStart(4, "0").toUpperCase()}\n` +
			`Flags=0x${this.flags.toString(16).padStart(4, "0").toUpperCase()}\n` +
			`Questions=${JSON.stringify(this.questions)}\n` +
			`Answers=${JSON.stringify(this.answers)}\n` +
			`Authorities=${JSON.stringify(this.authorities)}\n` +
			`Resources=${JSON.stringify(this.resources)}`
		);
	}
}

// Re-export BufferReader for internal use (e.g., by tests that need direct parsing)
export { BufferReader };
