/**
 * Logic related to logical AirPlay channels.
 *
 * This module deals with AirPlay 2 related channels.
 */

import { AbstractHAPChannel } from "../../auth/hapChannel.js";
import {
	formatRequest,
	formatResponse,
	type HttpRequest,
	type HttpResponse,
	parseRequest,
	parseResponse,
} from "../../support/http.js";
import { readVariant, writeVariant } from "../../support/variant.js";
import type { ProtocolMessageObj } from "../mrp/protobuf/index.js";
import { getRoot } from "../mrp/protobuf/index.js";
import { decodePlistBody, encodePlistBody } from "./utils.js";

const DATA_HEADER_PADDING = 0x00000000;

/** DataHeader: size(4) + message_type(12) + command(4) + seqno(8) + padding(4) = 32 bytes */
const DATA_HEADER_LENGTH = 32;

export interface DataStreamMessage {
	messageType: Buffer;
	command: Buffer;
	seqno: number;
	padding: number;
	payload: Buffer;
}

function encodeDataHeader(
	size: number,
	messageType: Buffer,
	command: Buffer,
	seqno: number,
	padding: number,
): Buffer {
	const buf = Buffer.alloc(DATA_HEADER_LENGTH);
	buf.writeUInt32BE(size, 0);
	messageType.copy(buf, 4, 0, Math.min(messageType.length, 12));
	command.copy(buf, 16, 0, Math.min(command.length, 4));
	buf.writeBigUInt64BE(BigInt(seqno), 20);
	buf.writeUInt32BE(padding, 28);
	return buf;
}

function decodeDataHeader(data: Buffer): {
	size: number;
	messageType: Buffer;
	command: Buffer;
	seqno: number;
	padding: number;
} {
	return {
		size: data.readUInt32BE(0),
		messageType: data.subarray(4, 16),
		command: data.subarray(16, 20),
		seqno: Number(data.readBigUInt64BE(20)),
		padding: data.readUInt32BE(28),
	};
}

/**
 * Base class for connection used to handle the event channel.
 */
export abstract class BaseEventChannel extends AbstractHAPChannel {
	static formatRequestMsg(request: HttpRequest): Buffer {
		return formatRequest(request);
	}

	static parseRequestMsg(data: Buffer): [HttpRequest | null, Buffer, Buffer] {
		const [request, rest] = parseRequest(data);
		return [request, data.subarray(0, data.length - rest.length), rest];
	}

	static formatResponseMsg(response: HttpResponse): Buffer {
		return formatResponse(response);
	}

	static parseResponseMsg(data: Buffer): [HttpResponse | null, Buffer, Buffer] {
		const [response, rest] = parseResponse(data);
		return [response, data.subarray(0, data.length - rest.length), rest];
	}
}

/**
 * Connection used to handle the event channel.
 */
export class EventChannel extends BaseEventChannel {
	handleReceived(): void {
		while (this.buffer.length > 0) {
			try {
				const [request, , rest] = BaseEventChannel.parseRequestMsg(this.buffer);
				if (request === null) {
					break;
				}
				this.buffer = rest;

				const headers: Record<string, string> = {
					"Content-Length": "0",
					"Audio-Latency": "0",
				};

				const reqHeaders =
					request.headers instanceof Map
						? Object.fromEntries(request.headers)
						: (request.headers as Record<string, string>);

				if (reqHeaders.Server) {
					headers.Server = reqHeaders.Server;
				}
				if (reqHeaders.CSeq) {
					headers.CSeq = reqHeaders.CSeq;
				}

				this.send(
					BaseEventChannel.formatResponseMsg({
						protocol: request.protocol,
						version: request.version,
						code: 200,
						message: "OK",
						headers,
						body: Buffer.alloc(0),
					}),
				);
			} catch {
				// Failed to handle message on event channel
				break;
			}
		}
	}
}

/**
 * Listener interface for DataStreamChannel.
 */
export interface DataStreamListener {
	handleProtobuf(message: ProtocolMessageObj): void;
	handleConnectionLost(exc: Error | null): void;
}

/**
 * Base class for data stream channel.
 */
export abstract class BaseDataStreamChannel extends AbstractHAPChannel {
	static encodeMessage(message: DataStreamMessage): Buffer {
		return Buffer.concat([
			encodeDataHeader(
				DATA_HEADER_LENGTH + message.payload.length,
				message.messageType,
				message.command,
				message.seqno,
				message.padding,
			),
			message.payload,
		]);
	}

	static encodePayload(payload: unknown): Buffer {
		return encodePlistBody(payload);
	}

	static encodeProtobufs(protobufMessages: ProtocolMessageObj[]): Buffer {
		const root = getRoot();
		const ProtocolMessage = root.lookupType("ProtocolMessage");
		const serializedMessages: Buffer[] = [];

		for (const protobufMessage of protobufMessages) {
			const encoded = ProtocolMessage.encode(
				ProtocolMessage.fromObject(protobufMessage),
			).finish();
			const serializedMessage = Buffer.from(
				encoded.buffer,
				encoded.byteOffset,
				encoded.byteLength,
			);
			serializedMessages.push(writeVariant(serializedMessage.length));
			serializedMessages.push(serializedMessage);
		}
		return Buffer.concat(serializedMessages);
	}

	encodeReply(seqno: number): Buffer {
		return BaseDataStreamChannel.encodeMessage({
			messageType: Buffer.concat([Buffer.from("rply"), Buffer.alloc(8)]),
			command: Buffer.alloc(4),
			seqno,
			padding: DATA_HEADER_PADDING,
			payload: Buffer.alloc(0),
		});
	}

	static decodeMessage(
		data: Buffer,
	): [DataStreamMessage | null, Buffer, Buffer] {
		if (data.length < DATA_HEADER_LENGTH) {
			return [null, Buffer.alloc(0), data];
		}
		const header = decodeDataHeader(data);
		if (data.length < header.size) {
			return [null, Buffer.alloc(0), data];
		}
		return [
			{
				messageType: header.messageType,
				command: header.command,
				seqno: header.seqno,
				padding: header.padding,
				payload: data.subarray(DATA_HEADER_LENGTH, header.size),
			},
			data.subarray(0, header.size),
			data.subarray(header.size),
		];
	}

	static decodePayload(payload: Buffer): Record<string, unknown> | null {
		return decodePlistBody(payload);
	}

	static decodeProtobufs(data: Buffer): ProtocolMessageObj[] {
		const root = getRoot();
		const ProtocolMessage = root.lookupType("ProtocolMessage");
		const pbMessages: ProtocolMessageObj[] = [];

		try {
			let remaining = data;
			while (remaining.length > 0) {
				let message: Buffer;

				if (remaining[0] === 0x08) {
					message = remaining;
					remaining = Buffer.alloc(0);
				} else {
					const [length, raw] = readVariant(remaining);
					if (raw.length < length) {
						break;
					}
					message = raw.subarray(0, length);
					remaining = raw.subarray(length);
				}

				const decoded = ProtocolMessage.decode(message);
				const obj = ProtocolMessage.toObject(decoded, {
					longs: Number,
					enums: Number,
					bytes: Buffer,
					defaults: false,
				}) as ProtocolMessageObj;
				pbMessages.push(obj);
			}
		} catch {
			// Failed to process data frame
		}
		return pbMessages;
	}
}

/**
 * Connection used to handle the data stream channel.
 */
export class DataStreamChannel extends BaseDataStreamChannel {
	sendSeqno: number;
	dataListener: DataStreamListener | null = null;

	constructor(outputKey: Buffer, inputKey: Buffer) {
		super(outputKey, inputKey);
		this.sendSeqno = 0x100000000 + Math.floor(Math.random() * 0xffffffff);
	}

	handleReceived(): void {
		while (this.buffer.length >= DATA_HEADER_LENGTH) {
			const [message, , rest] = BaseDataStreamChannel.decodeMessage(
				this.buffer,
			);
			if (!message) {
				break;
			}
			this.buffer = rest;

			const payload = BaseDataStreamChannel.decodePayload(message.payload);
			if (payload) {
				this._processPayload(payload);
			}

			// If this was a request, send a reply to satisfy other end
			if (message.messageType.subarray(0, 4).toString() === "sync") {
				this.send(this.encodeReply(message.seqno));
			}
		}
	}

	private _processPayload(message: Record<string, unknown>): void {
		const params = message.params as Record<string, unknown> | undefined;
		const data = params?.data as Buffer | undefined;
		if (data === undefined) {
			return;
		}

		for (const pbMsg of BaseDataStreamChannel.decodeProtobufs(data)) {
			this.dataListener?.handleProtobuf(pbMsg);
		}
	}

	sendProtobuf(message: ProtocolMessageObj): void {
		this.send(
			BaseDataStreamChannel.encodeMessage({
				messageType: Buffer.concat([Buffer.from("sync"), Buffer.alloc(8)]),
				command: Buffer.from("comm"),
				seqno: this.sendSeqno,
				padding: DATA_HEADER_PADDING,
				payload: BaseDataStreamChannel.encodePayload({
					params: {
						data: BaseDataStreamChannel.encodeProtobufs([message]),
					},
				}),
			}),
		);
	}
}

export { DATA_HEADER_LENGTH, DATA_HEADER_PADDING };
