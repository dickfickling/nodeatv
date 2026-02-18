/**
 * Device pairing and derivation of encryption keys for Companion protocol.
 */

import { SRPAuthHandler } from "../../auth/hapSrp.js";
import type { Core } from "../../core/core.js";
import { PairingError } from "../../exceptions.js";
import { CompanionPairSetupProcedure } from "./auth.js";
import { CompanionConnection } from "./connection.js";
import { CompanionProtocol } from "./protocol.js";

export class CompanionPairingHandler {
	private _core: Core;
	private _name: string;
	private _connection: CompanionConnection;
	private _srp: SRPAuthHandler;
	private _protocol: CompanionProtocol;
	private _pairingProcedure: CompanionPairSetupProcedure;
	private _pinCode: number | null = null;
	private _hasPaired = false;

	constructor(core: Core, options?: Record<string, unknown>) {
		this._core = core;
		this._name = (options?.name as string) ?? "nodeatv";
		this._connection = new CompanionConnection(
			String(core.config.address),
			core.service.port,
		);
		this._srp = new SRPAuthHandler();
		this._protocol = new CompanionProtocol(
			this._connection,
			this._srp,
			core.service,
		);
		this._pairingProcedure = new CompanionPairSetupProcedure(
			this._protocol,
			this._srp,
		);
	}

	get hasPaired(): boolean {
		return this._hasPaired;
	}

	get deviceProvidesPin(): boolean {
		return true;
	}

	pin(pinCode: number): void {
		this._pinCode = pinCode;
	}

	async begin(): Promise<void> {
		await this._pairingProcedure.startPairing();
	}

	async finish(): Promise<void> {
		if (!this._pinCode) {
			throw new PairingError("no pin given");
		}

		const credentials = await this._pairingProcedure.finishPairing(
			"",
			this._pinCode,
			this._name,
		);

		this._core.service.credentials = credentials.toString();
		this._core.settings.protocols.companion.credentials =
			this._core.service.credentials;
		this._hasPaired = true;
	}

	async close(): Promise<void> {
		this._protocol.stop();
	}
}
