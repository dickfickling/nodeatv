import { InvalidCredentialsError } from "../exceptions.js";

export enum AuthenticationType {
	Null = "Null",
	Legacy = "Legacy",
	HAP = "HAP",
	Transient = "Transient",
}

export class HapCredentials {
	ltpk: Buffer;
	ltsk: Buffer;
	atvId: Buffer;
	clientId: Buffer;
	type: AuthenticationType;

	constructor(
		ltpk: Buffer = Buffer.alloc(0),
		ltsk: Buffer = Buffer.alloc(0),
		atvId: Buffer = Buffer.alloc(0),
		clientId: Buffer = Buffer.alloc(0),
	) {
		this.ltpk = ltpk;
		this.ltsk = ltsk;
		this.atvId = atvId;
		this.clientId = clientId;
		this.type = this._getAuthType();
	}

	private _getAuthType(): AuthenticationType {
		const empty = (b: Buffer) => b.length === 0;
		if (
			empty(this.ltpk) &&
			empty(this.ltsk) &&
			empty(this.atvId) &&
			empty(this.clientId)
		) {
			return AuthenticationType.Null;
		}
		if (this.ltpk.equals(Buffer.from("transient"))) {
			return AuthenticationType.Transient;
		}
		if (
			empty(this.ltpk) &&
			!empty(this.ltsk) &&
			empty(this.atvId) &&
			!empty(this.clientId)
		) {
			return AuthenticationType.Legacy;
		}
		if (
			!empty(this.ltpk) &&
			!empty(this.ltsk) &&
			!empty(this.atvId) &&
			!empty(this.clientId)
		) {
			return AuthenticationType.HAP;
		}
		throw new InvalidCredentialsError("invalid credentials type");
	}

	equals(other: HapCredentials): boolean {
		return this.toString() === other.toString();
	}

	toString(): string {
		return [
			this.ltpk.toString("hex"),
			this.ltsk.toString("hex"),
			this.atvId.toString("hex"),
			this.clientId.toString("hex"),
		].join(":");
	}
}

export abstract class PairSetupProcedure {
	abstract startPairing(): Promise<void>;
	abstract finishPairing(
		username: string,
		pinCode: number,
		displayName?: string | null,
	): Promise<HapCredentials>;
}

export abstract class PairVerifyProcedure {
	abstract verifyCredentials(): Promise<boolean>;
	abstract encryptionKeys(
		salt: string,
		outputInfo: string,
		inputInfo: string,
	): [Buffer, Buffer];
}

export const NO_CREDENTIALS = new HapCredentials();
export const TRANSIENT_CREDENTIALS = new HapCredentials(
	Buffer.from("transient"),
);

export function parseCredentials(detailString: string | null): HapCredentials {
	if (detailString === null) return NO_CREDENTIALS;

	const split = detailString.split(":");
	if (split.length === 2) {
		const clientId = Buffer.from(split[0], "hex");
		const ltsk = Buffer.from(split[1], "hex");
		return new HapCredentials(Buffer.alloc(0), ltsk, Buffer.alloc(0), clientId);
	}
	if (split.length === 4) {
		const ltpk = Buffer.from(split[0], "hex");
		const ltsk = Buffer.from(split[1], "hex");
		const atvId = Buffer.from(split[2], "hex");
		const clientId = Buffer.from(split[3], "hex");
		return new HapCredentials(ltpk, ltsk, atvId, clientId);
	}

	throw new InvalidCredentialsError(`invalid credentials: ${detailString}`);
}
