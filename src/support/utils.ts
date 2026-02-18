import { ConnectionFailedError } from "../exceptions.js";

const BINARY_LINE_LENGTH = 512;

function shorten(text: string | Buffer, length: number): string {
	if (typeof text === "string") {
		return text.length < length ? text : `${text.slice(0, length - 3)}...`;
	}
	if (text.length < length) return text.toString();
	return `${text.subarray(0, length - 3).toString()}...`;
}

function logValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (Buffer.isBuffer(value)) {
		return value.toString("hex");
	}
	return String(value);
}

export async function errorHandler<T>(
	func: (...args: unknown[]) => Promise<T>,
	fallback: new (msg: string) => Error,
	...args: unknown[]
): Promise<T> {
	try {
		return await func(...args);
	} catch (ex) {
		if (ex instanceof Error) {
			if (
				ex.name === "ConnectionFailedError" ||
				ex.constructor.name === "ConnectionFailedError"
			) {
				throw ex;
			}
			if (ex.name === "BackOffError" || ex.name === "NoCredentialsError") {
				throw ex;
			}
			if (
				ex instanceof TypeError ||
				(ex as NodeJS.ErrnoException).code !== undefined ||
				ex.name === "TimeoutError"
			) {
				throw new ConnectionFailedError(String(ex));
			}
		}
		throw new fallback(String(ex));
	}
}

export function logBinary(
	logger: {
		isEnabledFor?(level: number): boolean;
		debug(...args: unknown[]): void;
	},
	message: string,
	kwargs: Record<string, unknown> = {},
	level = 10,
): void {
	if (logger.isEnabledFor && !logger.isEnabledFor(level)) return;

	const overrideLength = Number.parseInt(
		process.env.NODEATV_BINARY_MAX_LINE ?? "0",
		10,
	);
	const lineLength = overrideLength || BINARY_LINE_LENGTH;

	const parts = Object.keys(kwargs)
		.sort()
		.map((k) => `${k}=${shorten(logValue(kwargs[k]), lineLength)}`);

	logger.debug("%s (%s)", message, parts.join(", "));
}

export function mapRange(
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number,
): number {
	if (inMax - inMin <= 0.0) throw new Error("invalid input range");
	if (outMax - outMin <= 0.0) throw new Error("invalid output range");
	if (value < inMin || value > inMax)
		throw new Error("input value out of range");
	return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

export function shiftHexIdentifier(identifier: string): string {
	if (identifier.length < 2) {
		throw new Error("identifier must be at least 2 characters");
	}
	const first = identifier.slice(0, 2);
	const rest = identifier.slice(2);
	let shifted = ((Number.parseInt(first, 16) + 1) % 256)
		.toString(16)
		.padStart(2, "0");
	if (identifier === identifier.toUpperCase()) {
		shifted = shifted.toUpperCase();
	}
	return shifted + rest;
}

export function prettydataclass(maxLength = 150) {
	// biome-ignore lint: mixin class needs any[] constructor
	return function <T extends new (...args: any[]) => object>(cls: T): T {
		const original = cls;
		const wrapped = class extends original {
			toString(): string {
				const fields = Object.keys(this);
				const parts = fields.map((f) => {
					const val = (this as Record<string, unknown>)[f];
					if (typeof val === "string" || Buffer.isBuffer(val)) {
						return `${f}=${shorten(val, maxLength)}`;
					}
					return `${f}=${val}`;
				});
				return `${original.name}(${parts.join(", ")})`;
			}
		};
		Object.defineProperty(wrapped, "name", { value: original.name });
		return wrapped as unknown as T;
	};
}

export function deprecated<T extends (...args: unknown[]) => unknown>(
	func: T,
): T {
	const wrapper = function (this: unknown, ...args: unknown[]) {
		console.warn(`Call to deprecated function ${func.name}.`);
		return func.apply(this, args);
	} as unknown as T;
	Object.defineProperty(wrapper, "name", { value: func.name });
	return wrapper;
}
