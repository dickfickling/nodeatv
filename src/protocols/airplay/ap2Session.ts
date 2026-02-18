/**
 * Implementation of "high-level" support for an AirPlay 2 session.
 *
 * Sets up a connection to an AirPlay 2 receiver and ensures encryption and
 * most low-level stuff is taken care of.
 */

import { randomUUID } from "node:crypto";
import { setupChannel } from "../../auth/hapChannel.js";
import type {
	HapCredentials,
	PairVerifyProcedure,
} from "../../auth/hapPairing.js";
import { InvalidStateError } from "../../exceptions.js";
import type { DeviceListener } from "../../interface.js";
import type { InfoSettings } from "../../settings.js";
import {
	decodeBplistFromBody,
	type HttpConnection,
	httpConnect,
} from "../../support/http.js";
import { RtspSession } from "../../support/rtsp.js";
import type { StateProducer } from "../../support/stateProducer.js";
import { verifyConnection } from "./auth/index.js";
import { DataStreamChannel, EventChannel } from "./channels.js";

const FEEDBACK_INTERVAL = 2000; // milliseconds

const EVENTS_SALT = "Events-Salt";
const EVENTS_WRITE_INFO = "Events-Write-Encryption-Key";
const EVENTS_READ_INFO = "Events-Read-Encryption-Key";

const DATASTREAM_SALT = "DataStream-Salt"; // seed must be appended
const DATASTREAM_OUTPUT_INFO = "DataStream-Output-Encryption-Key";
const DATASTREAM_INPUT_INFO = "DataStream-Input-Encryption-Key";

/**
 * High-level session for AirPlay 2.
 */
export class AP2Session {
	private _address: string;
	private _controlPort: number;
	private _credentials: HapCredentials;
	private _info: InfoSettings;
	connection: HttpConnection | null = null;
	verifier: PairVerifyProcedure | null = null;
	rtsp: RtspSession | null = null;
	dataChannel: DataStreamChannel | null = null;
	private _channels: Array<{ close(): void }> = [];
	private _feedbackTimer: ReturnType<typeof setInterval> | null = null;

	constructor(
		address: string,
		controlPort: number,
		credentials: HapCredentials,
		info: InfoSettings,
	) {
		this._address = address;
		this._controlPort = controlPort;
		this._credentials = credentials;
		this._info = info;
	}

	async connect(): Promise<void> {
		this.connection = await httpConnect(this._address, this._controlPort);
		this.verifier = await verifyConnection(this._credentials, this.connection);
		this.rtsp = new RtspSession(this.connection);
	}

	async setupRemoteControl(): Promise<void> {
		if (this.connection === null || this.rtsp === null) {
			throw new InvalidStateError("not connected to remote");
		}

		await this._setupEventChannel(this.connection.remoteIp);
		await this.rtsp.record();
		await this._setupDataChannel(this.connection.remoteIp);
	}

	startKeepAlive(deviceListener: StateProducer<DeviceListener>): void {
		const sendFeedback = async () => {
			try {
				if (this.rtsp) {
					await this.rtsp.feedback();
				}
			} catch {
				this.stopKeepAlive();
				(
					deviceListener as unknown as {
						listener: DeviceListener;
					}
				).listener.connectionLost(new Error("feedback failed"));
			}
		};

		this._feedbackTimer = setInterval(sendFeedback, FEEDBACK_INTERVAL);
	}

	stopKeepAlive(): void {
		if (this._feedbackTimer) {
			clearInterval(this._feedbackTimer);
			this._feedbackTimer = null;
		}
	}

	private async _setup(
		body: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		if (!this.rtsp) {
			throw new InvalidStateError("not connected");
		}
		const resp = await this.rtsp.setup({ body });
		return decodeBplistFromBody(resp);
	}

	private async _setupEventChannel(address: string): Promise<void> {
		if (this.verifier === null) {
			throw new InvalidStateError("not in connected state");
		}

		const resp = await this._setup({
			isRemoteControlOnly: true,
			osName: this._info.osName,
			sourceVersion: "550.10",
			timingProtocol: "None",
			model: this._info.model,
			deviceID: this._info.deviceId,
			osVersion: this._info.osVersion,
			osBuildVersion: this._info.osBuild,
			macAddress: this._info.mac,
			sessionUUID: randomUUID().toUpperCase(),
			name: this._info.name,
		});

		const eventPort = resp.eventPort as number;

		// Note: Read/Write info reversed here as connection originates from receiver!
		const channel = await setupChannel(
			(outKey: Buffer, inKey: Buffer) => new EventChannel(outKey, inKey),
			this.verifier,
			address,
			eventPort,
			EVENTS_SALT,
			EVENTS_READ_INFO,
			EVENTS_WRITE_INFO,
		);
		this._channels.push(channel);
	}

	private async _setupDataChannel(address: string): Promise<void> {
		if (this.verifier === null) {
			throw new InvalidStateError("not in connected state");
		}

		const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

		const resp = await this._setup({
			streams: [
				{
					controlType: 2,
					channelID: randomUUID().toUpperCase(),
					seed,
					clientUUID: randomUUID().toUpperCase(),
					type: 130,
					wantsDedicatedSocket: true,
					clientTypeUUID: "1910A70F-DBC0-4242-AF95-115DB30604E1",
				},
			],
		});

		const streams = resp.streams as Array<Record<string, unknown>>;
		const dataPort = streams[0].dataPort as number;

		const channel = await setupChannel(
			(outKey: Buffer, inKey: Buffer) => new DataStreamChannel(outKey, inKey),
			this.verifier,
			address,
			dataPort,
			DATASTREAM_SALT + String(seed),
			DATASTREAM_OUTPUT_INFO,
			DATASTREAM_INPUT_INFO,
		);
		this._channels.push(channel);
		this.dataChannel = channel as DataStreamChannel;
	}

	stop(): Set<Promise<void>> {
		const tasks = new Set<Promise<void>>();

		this.stopKeepAlive();

		if (this.connection) {
			this.connection.close();
			this.connection = null;
		}
		for (const channel of this._channels) {
			channel.close();
		}
		this._channels.length = 0;
		return tasks;
	}
}

export {
	FEEDBACK_INTERVAL,
	EVENTS_SALT,
	EVENTS_WRITE_INFO,
	EVENTS_READ_INFO,
	DATASTREAM_SALT,
	DATASTREAM_OUTPUT_INFO,
	DATASTREAM_INPUT_INFO,
};
