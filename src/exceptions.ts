export class NoServiceError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "NoServiceError";
	}
}

export class UnsupportedProtocolError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "UnsupportedProtocolError";
	}
}

export class ConnectionFailedError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "ConnectionFailedError";
	}
}

export class ConnectionLostError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "ConnectionLostError";
	}
}

export class PairingError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "PairingError";
	}
}

export class AuthenticationError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "AuthenticationError";
	}
}

export class NotSupportedError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "NotSupportedError";
	}
}

export class InvalidDmapDataError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "InvalidDmapDataError";
	}
}

export class UnknownMediaKindError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "UnknownMediaKindError";
	}
}

export class UnknownPlayStateError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "UnknownPlayStateError";
	}
}

export class NoAsyncListenerError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "NoAsyncListenerError";
	}
}

export class NoCredentialsError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "NoCredentialsError";
	}
}

export class InvalidCredentialsError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "InvalidCredentialsError";
	}
}

export class DeviceIdMissingError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "DeviceIdMissingError";
	}
}

export class BackOffError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "BackOffError";
	}
}

export class PlaybackError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "PlaybackError";
	}
}

export class CommandError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "CommandError";
	}
}

export class NonLocalSubnetError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "NonLocalSubnetError";
	}
}

export class InvalidStateError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "InvalidStateError";
	}
}

export class ProtocolError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "ProtocolError";
	}
}

export class HttpError extends ProtocolError {
	private _statusCode: number;

	constructor(message: string, statusCode: number) {
		super(message);
		this.name = "HttpError";
		this._statusCode = statusCode;
	}

	get statusCode(): number {
		return this._statusCode;
	}
}

export class InvalidConfigError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "InvalidConfigError";
	}
}

export class BlockedStateError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "BlockedStateError";
	}
}

export class InvalidResponseError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "InvalidResponseError";
	}
}

export class OperationTimeoutError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "OperationTimeoutError";
	}
}

export class SettingsError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "SettingsError";
	}
}
