/**
 * MRP connection implemented as a channel/stream over AirPlay.
 */

import { InvalidStateError } from "../../exceptions.js";
import type { DeviceListener } from "../../interface.js";
import type { StateProducer } from "../../support/stateProducer.js";
import { AbstractMrpConnection } from "../mrp/connection.js";
import type { ProtocolMessageObj } from "../mrp/protobuf/index.js";
import type { AP2Session } from "./ap2Session.js";
import type { DataStreamChannel, DataStreamListener } from "./channels.js";

/**
 * Transparent connection/channel for transporting MRP messages over AirPlay.
 */
export class AirPlayMrpConnection
	extends AbstractMrpConnection
	implements DataStreamListener
{
	session: AP2Session;
	dataChannel: DataStreamChannel | null = null;
	deviceListener: StateProducer<DeviceListener> | null;

	constructor(
		session: AP2Session,
		deviceListener?: StateProducer<DeviceListener> | null,
	) {
		super();
		this.session = session;
		this.deviceListener = deviceListener ?? null;
	}

	async connect(): Promise<void> {
		if (this.session.dataChannel === null) {
			throw new InvalidStateError("remote control channel not connected");
		}

		this.dataChannel = this.session.dataChannel;
		this.dataChannel.dataListener = this;
	}

	enableEncryption(_outputKey: Buffer, _inputKey: Buffer): void {
		// Encryption is handled at the channel level
	}

	get connected(): boolean {
		return true;
	}

	close(): void {
		if (this.dataChannel !== null) {
			this.dataChannel.close();
			this.dataChannel = null;
		}
	}

	send(message: ProtocolMessageObj): void {
		if (this.dataChannel !== null) {
			this.dataChannel.sendProtobuf(message);
		}
	}

	sendRaw(_data: Buffer): void {
		// Not applicable for AirPlay MRP connection
	}

	handleProtobuf(message: ProtocolMessageObj): void {
		if (this._receiveCallback) {
			this._receiveCallback(message, Buffer.alloc(0));
		}
	}

	handleConnectionLost(exc: Error | null): void {
		if (this.deviceListener) {
			if (exc === null) {
				(
					this.deviceListener as unknown as {
						listener: DeviceListener;
					}
				).listener.connectionClosed();
			} else {
				(
					this.deviceListener as unknown as {
						listener: DeviceListener;
					}
				).listener.connectionLost(exc);
			}
		}
	}
}
