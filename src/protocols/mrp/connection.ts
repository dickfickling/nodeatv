/**
 * Network layer for MRP protocol.
 *
 * Handles TCP connections with varint framing and optional ChaCha20 encryption.
 */

import * as net from "node:net";
import { Chacha20Cipher8byteNonce } from "../../support/chacha20.js";
import { readVariant, writeVariant } from "../../support/variant.js";
import { getRoot, type ProtocolMessageObj } from "./protobuf/index.js";

export type ReceiveCallback = (
	message: ProtocolMessageObj,
	raw: Buffer,
) => void;
export type CloseCallback = () => void;

/**
 * Abstract base class for an MRP connection.
 */
export abstract class AbstractMrpConnection {
	protected _receiveCallback: ReceiveCallback | null = null;
	protected _closeCallback: CloseCallback | null = null;

	setCallbacks(receive: ReceiveCallback, close: CloseCallback): void {
		this._receiveCallback = receive;
		this._closeCallback = close;
	}

	abstract connect(): Promise<void>;
	abstract close(): void;
	abstract send(message: ProtocolMessageObj): void;
	abstract sendRaw(data: Buffer): void;
	abstract enableEncryption(outputKey: Buffer, inputKey: Buffer): void;
	abstract get connected(): boolean;
}

/**
 * MRP network connection with varint framing and optional encryption.
 */
export class MrpConnection extends AbstractMrpConnection {
	private _host: string;
	private _port: number;
	private _socket: net.Socket | null = null;
	private _buffer: Buffer = Buffer.alloc(0);
	private _chacha: Chacha20Cipher8byteNonce | null = null;

	constructor(host: string, port: number) {
		super();
		this._host = host;
		this._port = port;
	}

	get connected(): boolean {
		return this._socket !== null && !this._socket.destroyed;
	}

	async connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const socket = net.createConnection(
				{ host: this._host, port: this._port },
				() => {
					this._socket = socket;
					resolve();
				},
			);

			socket.on("error", (err) => {
				if (!this._socket) {
					reject(err);
				}
			});

			socket.on("data", (data: Buffer) => {
				this._dataReceived(data);
			});

			socket.on("close", () => {
				this._socket = null;
				this._chacha = null;
				if (this._closeCallback) {
					this._closeCallback();
				}
			});

			socket.on("end", () => {
				socket.end();
			});

			socket.setNoDelay(true);
		});
	}

	enableEncryption(outputKey: Buffer, inputKey: Buffer): void {
		this._chacha = new Chacha20Cipher8byteNonce(outputKey, inputKey);
	}

	close(): void {
		if (this._socket) {
			this._socket.destroy();
		}
		this._socket = null;
		this._chacha = null;
	}

	send(message: ProtocolMessageObj): void {
		const root = getRoot();
		const ProtocolMessage = root.lookupType("ProtocolMessage");
		const errMsg = ProtocolMessage.verify(message);
		if (errMsg) {
			// Try to encode anyway - verify can be strict with extensions
		}
		const encoded = ProtocolMessage.encode(
			ProtocolMessage.fromObject(message),
		).finish();
		let data: Buffer = Buffer.from(
			encoded.buffer,
			encoded.byteOffset,
			encoded.byteLength,
		);

		if (this._chacha) {
			data = this._chacha.encrypt(data);
		}

		const framed = Buffer.concat([writeVariant(data.length), data]);
		if (this._socket && !this._socket.destroyed) {
			this._socket.write(framed);
		}
	}

	sendRaw(data: Buffer): void {
		if (this._chacha) {
			data = this._chacha.encrypt(data);
		}

		const framed = Buffer.concat([writeVariant(data.length), data]);
		if (this._socket && !this._socket.destroyed) {
			this._socket.write(framed);
		}
	}

	private _dataReceived(data: Buffer): void {
		this._buffer = Buffer.concat([this._buffer, data]);

		while (this._buffer.length > 0) {
			let length: number;
			let remaining: Buffer;
			try {
				[length, remaining] = readVariant(this._buffer);
			} catch {
				// Not enough data for varint
				break;
			}

			if (remaining.length < length) {
				// Not enough data for the full message
				break;
			}

			const messageData = remaining.subarray(0, length);
			this._buffer = remaining.subarray(length);

			try {
				this._handleMessage(messageData);
			} catch {
				// Failed to handle message, skip
			}
		}
	}

	private _handleMessage(data: Buffer): void {
		if (this._chacha) {
			data = this._chacha.decrypt(data);
		}

		const root = getRoot();
		const ProtocolMessage = root.lookupType("ProtocolMessage");
		const decoded = ProtocolMessage.decode(data);
		const obj = ProtocolMessage.toObject(decoded, {
			longs: Number,
			enums: Number,
			bytes: Buffer,
			defaults: false,
		}) as ProtocolMessageObj;

		if (this._receiveCallback) {
			this._receiveCallback(obj, data);
		}
	}

	toString(): string {
		return `MRP:${this._host}:${this._port}`;
	}
}
