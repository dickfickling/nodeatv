/**
 * Device pairing handler for MRP protocol.
 */

import { parseCredentials } from "../../auth/hapPairing.js";
import { SRPAuthHandler } from "../../auth/hapSrp.js";
import type { Core } from "../../core/core.js";
import { PairingError } from "../../exceptions.js";
import { MrpPairSetupProcedure, MrpPairVerifyProcedure } from "./auth.js";
import { MrpConnection } from "./connection.js";
import { MrpProtocol } from "./protocol.js";

/**
 * Pairing handler for MRP protocol.
 */
export class MrpPairingHandler {
	private _core: Core;
	private _connection: MrpConnection;
	private _srp: SRPAuthHandler;
	private _protocol: MrpProtocol;
	private _pairingProcedure: MrpPairSetupProcedure;
	private _pinCode: string | null = null;
	private _hasPaired = false;

	constructor(core: Core) {
		this._core = core;
		this._connection = new MrpConnection(
			core.config.address,
			core.service.port,
		);
		this._srp = new SRPAuthHandler();
		this._protocol = new MrpProtocol(
			this._connection,
			this._srp,
			core.service,
			core.settings.info,
		);
		this._pairingProcedure = new MrpPairSetupProcedure(
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

	pin(pin: number | string): void {
		this._pinCode = String(pin).padStart(4, "0");
	}

	async begin(): Promise<void> {
		await this._pairingProcedure.startPairing();
	}

	async finish(): Promise<void> {
		if (!this._pinCode) {
			throw new PairingError("no pin given");
		}

		const credentials = String(
			await this._pairingProcedure.finishPairing(
				"",
				Number.parseInt(this._pinCode, 10),
				null,
			),
		);

		// Verify the credentials
		const verifier = new MrpPairVerifyProcedure(
			this._protocol,
			this._srp,
			parseCredentials(credentials),
		);
		await verifier.verifyCredentials();

		this._core.service.credentials = credentials;
		this._core.settings.protocols.mrp.credentials =
			this._core.service.credentials;
		this._hasPaired = true;
	}

	async close(): Promise<void> {
		this._connection.close();
	}
}
