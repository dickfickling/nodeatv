import { BlockedStateError, InvalidStateError } from "../exceptions.js";

const SHIELD_VAR = "__shield_is_blocking";

export function shield<T extends object>(obj: T): T {
	(obj as Record<string, unknown>)[SHIELD_VAR] = false;
	return obj;
}

export function isShielded(obj: object): boolean {
	return SHIELD_VAR in obj;
}

export function block(obj: object): void {
	if (!isShielded(obj)) {
		throw new InvalidStateError("object is not shielded");
	}
	(obj as Record<string, unknown>)[SHIELD_VAR] = true;
}

export function isBlocking(obj: object): boolean {
	return (
		isShielded(obj) && (obj as Record<string, unknown>)[SHIELD_VAR] === true
	);
}

export function guard(
	// biome-ignore lint/suspicious/noExplicitAny: guard wrapper needs flexibility
	fn: (...args: any[]) => any,
	name: string,
	// biome-ignore lint/suspicious/noExplicitAny: guard wrapper needs flexibility
): (...args: any[]) => any {
	return function (this: object, ...args: unknown[]) {
		if (isBlocking(this)) {
			throw new BlockedStateError(`${name} is blocked`);
		}
		return fn.apply(this, args);
	};
}
