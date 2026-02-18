/**
 * Connection abstraction for Companion protocol.
 */

import * as net from "node:net";
import { Chacha20Cipher } from "../../support/chacha20.js";

const AUTH_TAG_LENGTH = 16;
const HEADER_LENGTH = 4;

export enum FrameType {
	Unknown = 0,
	NoOp = 1,
	PS_Start = 3,
	PS_Next = 4,
	PV_Start = 5,
	PV_Next = 6,
	U_OPACK = 7,
	E_OPACK = 8,
	P_OPACK = 9,
	PA_Req = 10,
	PA_Rsp = 11,
	SessionStartRequest = 16,
	SessionStartResponse = 17,
	SessionData = 18,
	FamilyIdentityRequest = 32,
	FamilyIdentityResponse = 33,
	FamilyIdentityUpdate = 34,
}

export interface CompanionConnectionListener {
	frameReceived(frameType: FrameType, data: Buffer): void;
}

export class CompanionConnection {
	private _host: string;
	private _port: number;
	private _socket: net.Socket | null = null;
	private _buffer: Buffer = Buffer.alloc(0);
	private _chacha: Chacha20Cipher | null = null;
	private _listener: CompanionConnectionListener | null = null;

	onClose: (() => void) | null = null;
	onError: ((err: Error) => void) | null = null;

	constructor(host: string, port: number) {
		this._host = host;
		this._port = port;
	}

	get connected(): boolean {
		return this._socket !== null;
	}

	setListener(listener: CompanionConnectionListener): void {
		this._listener = listener;
	}

	async connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const socket = new net.Socket();

			socket.once("connect", () => {
				this._socket = socket;
				resolve();
			});

			socket.once("error", (err) => {
				if (!this._socket) {
					reject(err);
				} else {
					this.onError?.(err);
				}
			});

			socket.on("data", (data: Buffer) => {
				this._dataReceived(data);
			});

			socket.on("close", () => {
				this._socket = null;
				this.onClose?.();
			});

			socket.connect(this._port, this._host);
		});
	}

	close(): void {
		if (this._socket) {
			this._socket.destroy();
			this._socket = null;
		}
	}

	enableEncryption(outputKey: Buffer, inputKey: Buffer): void {
		this._chacha = new Chacha20Cipher(outputKey, inputKey, 12);
	}

	send(frameType: FrameType, data: Buffer): void {
		if (!this._socket) {
			throw new Error("not connected");
		}

		let payloadLength = data.length;
		if (this._chacha && payloadLength > 0) {
			payloadLength += AUTH_TAG_LENGTH;
		}

		const header = Buffer.alloc(HEADER_LENGTH);
		header[0] = frameType;
		header[1] = (payloadLength >> 16) & 0xff;
		header[2] = (payloadLength >> 8) & 0xff;
		header[3] = payloadLength & 0xff;

		let payload = data;
		if (this._chacha && data.length > 0) {
			payload = this._chacha.encrypt(data, undefined, header);
		}

		this._socket.write(Buffer.concat([header, payload]));
	}

	private _dataReceived(data: Buffer): void {
		this._buffer = Buffer.concat([this._buffer, data]);

		while (this._buffer.length >= HEADER_LENGTH) {
			const payloadLength =
				(this._buffer[1] << 16) | (this._buffer[2] << 8) | this._buffer[3];
			const totalLength = HEADER_LENGTH + payloadLength;

			if (this._buffer.length < totalLength) {
				break;
			}

			const header = this._buffer.subarray(0, HEADER_LENGTH);
			let payload = this._buffer.subarray(HEADER_LENGTH, totalLength);
			this._buffer = this._buffer.subarray(totalLength);

			try {
				if (this._chacha && payload.length > 0) {
					payload = this._chacha.decrypt(payload, undefined, header);
				}

				this._listener?.frameReceived(header[0] as FrameType, payload);
			} catch {
				// Failed to handle frame
			}
		}
	}
}
