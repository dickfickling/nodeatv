/**
 * Implementation of the MRP protocol handler.
 *
 * Wraps an MrpConnection and handles:
 * - Automatic device info exchange
 * - Encryption setup via pair-verify
 * - Message dispatching
 * - Heartbeat keep-alive
 */

import { randomUUID } from "node:crypto";
import { parseCredentials } from "../../auth/hapPairing.js";
import type { SRPAuthHandler } from "../../auth/hapSrp.js";
import { MessageDispatcher } from "../../core/protocol.js";
import { InvalidStateError } from "../../exceptions.js";
import type { BaseService } from "../../interface.js";
import type { InfoSettings } from "../../settings.js";
import { MrpPairVerifyProcedure } from "./auth.js";
import type { AbstractMrpConnection } from "./connection.js";
import * as messages from "./messages.js";
import type { ProtocolMessageObj } from "./protobuf/index.js";
import * as protobuf from "./protobuf/index.js";

const SRP_SALT = "MediaRemote-Salt";
const SRP_OUTPUT_INFO = "MediaRemote-Write-Encryption-Key";
const SRP_INPUT_INFO = "MediaRemote-Read-Encryption-Key";

export enum ProtocolState {
	NOT_CONNECTED = 0,
	CONNECTING = 1,
	CONNECTED = 2,
	READY = 3,
	STOPPED = 4,
}

interface OutstandingMessage {
	resolve: (message: ProtocolMessageObj) => void;
	reject: (error: Error) => void;
}

/**
 * MRP protocol handler that wraps a connection and provides
 * message dispatch, send/receive with correlation, and heartbeat.
 */
export class MrpProtocol extends MessageDispatcher<number, ProtocolMessageObj> {
	connection: AbstractMrpConnection;
	srp: SRPAuthHandler;
	service: BaseService;
	info: InfoSettings;
	deviceInfo: ProtocolMessageObj | null = null;
	private _heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
	private _heartbeatRunning = false;
	private _outstanding: Map<string, OutstandingMessage> = new Map();
	private _state: ProtocolState = ProtocolState.NOT_CONNECTED;

	constructor(
		connection: AbstractMrpConnection,
		srp: SRPAuthHandler,
		service: BaseService,
		info: InfoSettings,
	) {
		super();
		this.connection = connection;
		this.srp = srp;
		this.service = service;
		this.info = info;

		this.connection.setCallbacks(
			(message, _raw) => this._messageReceived(message),
			() => this._connectionClosed(),
		);
	}

	async start(skipInitialMessages = false): Promise<void> {
		if (this._state !== ProtocolState.NOT_CONNECTED) {
			throw new InvalidStateError(ProtocolState[this._state]);
		}

		this._state = ProtocolState.CONNECTING;

		try {
			await this.connection.connect();
			this._state = ProtocolState.CONNECTED;

			// Use external credentials client ID if available
			if (this.service.credentials) {
				this.srp.pairingId = parseCredentials(
					this.service.credentials,
				).clientId;
			}

			// First message must always be DEVICE_INFORMATION
			this.deviceInfo = await this.sendAndReceive(
				messages.deviceInformation(
					this.info.name,
					this.srp.pairingId.toString("utf-8"),
					this.info.osBuild,
				),
			);

			// Distribute device info to listeners
			this.dispatch(protobuf.DEVICE_INFO_MESSAGE, this.deviceInfo);

			if (skipInitialMessages) {
				return;
			}

			// Enable encryption if credentials available
			await this._enableEncryption();

			// Set connection state
			await this.send(messages.setConnectionState());

			// Subscribe to updates
			await this.sendAndReceive(messages.clientUpdatesConfig());
			await this.sendAndReceive(messages.getKeyboardSession());
		} catch (ex) {
			this.stop();
			throw ex;
		}

		this._state = ProtocolState.READY;
	}

	stop(): void {
		if (this._heartbeatTimer !== null) {
			clearTimeout(this._heartbeatTimer);
			this._heartbeatTimer = null;
		}
		this._heartbeatRunning = false;

		for (const [, outstanding] of this._outstanding) {
			outstanding.reject(new Error("protocol stopped"));
		}
		this._outstanding.clear();

		this.connection.close();
		this._state = ProtocolState.STOPPED;
	}

	enableHeartbeat(): void {
		if (this._heartbeatRunning) return;
		this._heartbeatRunning = true;
		this._heartbeatLoop();
	}

	private async _heartbeatLoop(): Promise<void> {
		const INTERVAL = 30000;
		const MAX_RETRIES = 1;
		let attempts = 0;

		while (this._heartbeatRunning) {
			try {
				if (attempts === 0) {
					await new Promise<void>((resolve) => {
						this._heartbeatTimer = setTimeout(resolve, INTERVAL);
					});
				}

				if (!this._heartbeatRunning) break;

				await this.sendAndReceive(messages.create(protobuf.GENERIC_MESSAGE));
				attempts = 0;
			} catch {
				if (!this._heartbeatRunning) break;
				attempts++;
				if (attempts > MAX_RETRIES) {
					this.connection.close();
					break;
				}
			}
		}
	}

	private async _enableEncryption(): Promise<void> {
		if (this.service.credentials === null) {
			return;
		}

		const credentials = parseCredentials(this.service.credentials);
		const pairVerifier = new MrpPairVerifyProcedure(
			this,
			this.srp,
			credentials,
		);

		await pairVerifier.verifyCredentials();
		const [outputKey, inputKey] = pairVerifier.encryptionKeys(
			SRP_SALT,
			SRP_OUTPUT_INFO,
			SRP_INPUT_INFO,
		);
		this.connection.enableEncryption(outputKey, inputKey);
	}

	async send(message: ProtocolMessageObj): Promise<void> {
		if (
			this._state !== ProtocolState.CONNECTED &&
			this._state !== ProtocolState.READY
		) {
			throw new InvalidStateError(ProtocolState[this._state]);
		}

		this.connection.send(message);
	}

	async sendAndReceive(
		message: ProtocolMessageObj,
		generateIdentifier = true,
		timeout = 5000,
	): Promise<ProtocolMessageObj> {
		if (
			this._state !== ProtocolState.CONNECTED &&
			this._state !== ProtocolState.READY
		) {
			throw new InvalidStateError(ProtocolState[this._state]);
		}

		let identifier: string;
		if (generateIdentifier) {
			identifier = randomUUID().toUpperCase();
			message.identifier = identifier;
		} else {
			identifier = `type_${message.type}`;
		}

		this.connection.send(message);
		return this._receive(identifier, timeout);
	}

	private _receive(
		identifier: string,
		timeout: number,
	): Promise<ProtocolMessageObj> {
		return new Promise<ProtocolMessageObj>((resolve, reject) => {
			const timer = setTimeout(() => {
				this._outstanding.delete(identifier);
				reject(new Error(`timeout waiting for response: ${identifier}`));
			}, timeout);

			this._outstanding.set(identifier, {
				resolve: (msg: ProtocolMessageObj) => {
					clearTimeout(timer);
					resolve(msg);
				},
				reject: (err: Error) => {
					clearTimeout(timer);
					reject(err);
				},
			});
		});
	}

	private _messageReceived(message: ProtocolMessageObj): void {
		const identifier = message.identifier || `type_${message.type}`;

		if (this._outstanding.has(identifier)) {
			const outstanding = this._outstanding.get(identifier)!;
			this._outstanding.delete(identifier);
			outstanding.resolve(message);
		} else {
			this.dispatch(message.type ?? 0, message);
		}
	}

	private _connectionClosed(): void {
		for (const [, outstanding] of this._outstanding) {
			outstanding.reject(new Error("connection closed"));
		}
		this._outstanding.clear();
		this._heartbeatRunning = false;
	}
}
