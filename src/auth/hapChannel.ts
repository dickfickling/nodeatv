import type * as net from "node:net";
import { InvalidStateError } from "../exceptions.js";
import { StateProducer } from "../support/stateProducer.js";
import type { PairVerifyProcedure } from "./hapPairing.js";
import { HAPSession } from "./hapSession.js";

export abstract class AbstractHAPChannel extends StateProducer<object> {
	buffer: Buffer = Buffer.alloc(0);
	socket: net.Socket | null = null;
	session: HAPSession;

	constructor(outputKey: Buffer, inputKey: Buffer) {
		super();
		this.session = new HAPSession();
		this.session.enable(outputKey, inputKey);
	}

	get port(): number {
		if (!this.socket) {
			throw new InvalidStateError("not connected");
		}
		const _addr = this.socket.remoteAddress;
		return this.socket.remotePort ?? 0;
	}

	close(): void {
		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}
	}

	onData(data: Buffer): void {
		const decrypt = this.session.decrypt(data);
		if (decrypt.length > 0) {
			this.buffer = Buffer.concat([this.buffer, decrypt]);
			this.handleReceived();
		}
	}

	abstract handleReceived(): void;

	send(data: Buffer): void {
		if (!this.socket) {
			throw new InvalidStateError("not connected");
		}
		const encrypted = this.session.encrypt(data);
		this.socket.write(encrypted);
	}
}

export async function setupChannel(
	factory: (outKey: Buffer, inKey: Buffer) => AbstractHAPChannel,
	verifier: PairVerifyProcedure,
	address: string,
	port: number,
	salt: string,
	outputInfo: string,
	inputInfo: string,
): Promise<AbstractHAPChannel> {
	const [outKey, inKey] = verifier.encryptionKeys(salt, outputInfo, inputInfo);
	const channel = factory(outKey, inKey);

	const netMod = await import("node:net");
	return new Promise((resolve, reject) => {
		const socket = netMod.createConnection(port, address, () => {
			channel.socket = socket;
			socket.on("data", (data: Buffer) => channel.onData(data));
			socket.on("close", () => {
				channel.socket = null;
			});
			resolve(channel);
		});
		socket.on("error", reject);
	});
}
