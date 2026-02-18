/**
 * Implementation of the Companion protocol.
 */

import { parseCredentials } from "../../auth/hapPairing.js";
import type { SRPAuthHandler } from "../../auth/hapSrp.js";
import type { BaseService } from "../../interface.js";
import { SharedData } from "../../support/collections.js";
import * as opack from "../../support/opack.js";
import { CompanionPairVerifyProcedure } from "./auth.js";
import {
	type CompanionConnection,
	type CompanionConnectionListener,
	FrameType,
} from "./connection.js";

const AUTH_FRAMES = [
	FrameType.PS_Start,
	FrameType.PS_Next,
	FrameType.PV_Start,
	FrameType.PV_Next,
];

const OPACK_FRAMES = [FrameType.U_OPACK, FrameType.E_OPACK, FrameType.P_OPACK];

const DEFAULT_TIMEOUT = 5000; // milliseconds

const SRP_SALT = "";
const SRP_OUTPUT_INFO = "ClientEncrypt-main";
const SRP_INPUT_INFO = "ServerEncrypt-main";

type FrameIdType = number | FrameType;

export enum MessageType {
	Event = 1,
	Request = 2,
	Response = 3,
}

export interface CompanionProtocolListener {
	eventReceived(eventName: string, data: Record<string, unknown>): void;
}

export class CompanionProtocol implements CompanionConnectionListener {
	connection: CompanionConnection;
	srp: SRPAuthHandler;
	service: BaseService;
	private _xid: number;
	private _queues: Map<FrameIdType, SharedData<unknown>> = new Map();
	private _isStarted = false;
	private _listener: CompanionProtocolListener | null = null;

	constructor(
		connection: CompanionConnection,
		srp: SRPAuthHandler,
		service: BaseService,
	) {
		this.connection = connection;
		this.connection.setListener(this);
		this.srp = srp;
		this.service = service;
		this._xid = Math.floor(Math.random() * 0xffff);
	}

	get listener(): CompanionProtocolListener | null {
		return this._listener;
	}

	set listener(value: CompanionProtocolListener | null) {
		this._listener = value;
	}

	async start(): Promise<void> {
		if (this._isStarted) {
			throw new Error("Already started");
		}

		this._isStarted = true;
		await this.connection.connect();

		if (this.service.credentials) {
			const creds = parseCredentials(this.service.credentials);
			this.srp.pairingId = creds.clientId;
		}

		await this._setupEncryption();
	}

	stop(): void {
		this._queues.clear();
		this.connection.close();
	}

	private async _setupEncryption(): Promise<void> {
		if (this.service.credentials) {
			const credentials = parseCredentials(this.service.credentials);
			const pairVerifier = new CompanionPairVerifyProcedure(
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
	}

	async exchangeAuth(
		frameType: FrameType,
		data: Record<string, unknown>,
		timeout = DEFAULT_TIMEOUT,
	): Promise<Record<string, unknown>> {
		let identifier: FrameType;
		if (frameType === FrameType.PS_Start) {
			identifier = FrameType.PS_Next;
		} else if (frameType === FrameType.PV_Start) {
			identifier = FrameType.PV_Next;
		} else {
			identifier = frameType;
		}
		return this._exchangeGenericOpack(frameType, data, identifier, timeout);
	}

	async exchangeOpack(
		frameType: FrameType,
		data: Record<string, unknown>,
		timeout = DEFAULT_TIMEOUT,
	): Promise<Record<string, unknown>> {
		(data as Record<string, unknown>)._x = this._xid;
		const identifier = this._xid;
		this._xid += 1;
		return this._exchangeGenericOpack(frameType, data, identifier, timeout);
	}

	sendOpack(frameType: FrameType, data: Record<string, unknown>): void {
		if (!("_x" in data)) {
			(data as Record<string, unknown>)._x = this._xid;
			this._xid += 1;
		}
		this.connection.send(frameType, opack.pack(data));
	}

	private async _exchangeGenericOpack(
		frameType: FrameType,
		data: Record<string, unknown>,
		identifier: FrameIdType,
		timeout: number,
	): Promise<Record<string, unknown>> {
		this.sendOpack(frameType, data);
		const sharedData = new SharedData<unknown>();
		this._queues.set(identifier, sharedData);

		const unpackedObject = await sharedData.wait(timeout);

		if (typeof unpackedObject !== "object" || unpackedObject === null) {
			throw new Error(`Received unexpected type: ${typeof unpackedObject}`);
		}

		const result = unpackedObject as Record<string, unknown>;
		if ("_em" in result) {
			throw new Error(`Command failed: ${result._em}`);
		}

		return result;
	}

	frameReceived(frameType: FrameType, data: Buffer): void {
		if (OPACK_FRAMES.includes(frameType) || AUTH_FRAMES.includes(frameType)) {
			try {
				const [opackData] = opack.unpack(data);

				if (typeof opackData !== "object" || opackData === null) {
					return;
				}

				const dict = opackData as Record<string, unknown>;
				if (AUTH_FRAMES.includes(frameType)) {
					this._handleAuth(frameType, dict);
				} else {
					this._handleOpack(frameType, dict);
				}
			} catch {
				// Failed to process frame
			}
		}
	}

	private _handleAuth(
		frameType: FrameType,
		opackData: Record<string, unknown>,
	): void {
		const sharedData = this._queues.get(frameType);
		if (sharedData) {
			this._queues.delete(frameType);
			sharedData.set(opackData);
		}
	}

	private _handleOpack(
		_frameType: FrameType,
		opackData: Record<string, unknown>,
	): void {
		const messageType = opackData._t as number | undefined;

		if (messageType === MessageType.Event) {
			this._listener?.eventReceived(
				opackData._i as string,
				opackData._c as Record<string, unknown>,
			);
		} else if (messageType === MessageType.Response) {
			const xid = opackData._x as number | undefined;
			if (xid !== undefined && this._queues.has(xid)) {
				const sharedData = this._queues.get(xid)!;
				this._queues.delete(xid);
				sharedData.set(opackData);
			}
		}
	}
}
