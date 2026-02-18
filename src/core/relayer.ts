import type { Protocol } from "../const.js";
import { InvalidStateError, NotSupportedError } from "../exceptions.js";

export class Relayer<T> {
	private _baseInterface: new (
		...args: unknown[]
	) => T;
	private _priorities: Protocol[];
	private _interfaces: Map<Protocol, T> = new Map();
	private _takeoverProtocol: Protocol[] = [];

	constructor(
		baseInterface: new (...args: unknown[]) => T,
		protocolPriority: Protocol[],
	) {
		this._baseInterface = baseInterface;
		this._priorities = protocolPriority;
	}

	get count(): number {
		return this._interfaces.size;
	}

	get mainInstance(): T {
		for (const priority of [...this._takeoverProtocol, ...this._priorities]) {
			const instance = this._interfaces.get(priority);
			if (instance) return instance;
		}
		throw new NotSupportedError();
	}

	get mainProtocol(): Protocol | null {
		for (const priority of [...this._takeoverProtocol, ...this._priorities]) {
			if (this._interfaces.has(priority)) return priority;
		}
		return null;
	}

	get instances(): T[] {
		return [...this._interfaces.values()];
	}

	register(instance: T, protocol: Protocol): void {
		if (!this._priorities.includes(protocol)) {
			throw new Error(`${protocol} not in priority list`);
		}
		this._interfaces.set(protocol, instance);
	}

	get(protocol: Protocol): T | null {
		return this._interfaces.get(protocol) ?? null;
	}

	relay(target: string, priority?: Protocol[]): unknown {
		const instance = this._findInstance(target, [
			...this._takeoverProtocol,
			...(priority ?? this._priorities),
		]);
		const descriptor = this._getPropertyDescriptor(instance, target);
		if (descriptor?.get) {
			return descriptor.get.call(instance);
		}
		const value = (instance as Record<string, unknown>)[target];
		if (typeof value === "function") {
			// biome-ignore lint/complexity/noBannedTypes: dynamic method binding
			return (value as Function).bind(instance);
		}
		return value;
	}

	private _getPropertyDescriptor(
		obj: unknown,
		prop: string,
	): PropertyDescriptor | undefined {
		let proto = Object.getPrototypeOf(obj);
		while (proto) {
			const desc = Object.getOwnPropertyDescriptor(proto, prop);
			if (desc) return desc;
			proto = Object.getPrototypeOf(proto);
		}
		return undefined;
	}

	private _findInstance(target: string, priority: Protocol[]): T {
		for (const priorityIface of priority) {
			const instance = this._interfaces.get(priorityIface);
			if (!instance) continue;

			const relayTarget = this._getPropertyDescriptor(instance, target);

			if (!relayTarget) {
				throw new Error(`${target} not in ${priorityIface}`);
			}

			// Check if the method is overridden from base interface
			const baseDescriptor = Object.getOwnPropertyDescriptor(
				this._baseInterface.prototype,
				target,
			);

			if (baseDescriptor) {
				const baseValue = baseDescriptor.get ?? baseDescriptor.value;
				const instanceValue = relayTarget.get ?? relayTarget.value;
				if (baseValue === instanceValue) continue;
			}

			return instance;
		}

		throw new NotSupportedError(`${target} is not supported`);
	}

	takeover(protocol: Protocol): void {
		if (this._takeoverProtocol.length > 0) {
			throw new InvalidStateError(
				`${this._takeoverProtocol[0]} has already done takeover`,
			);
		}
		this._takeoverProtocol = [protocol];
	}

	release(): void {
		this._takeoverProtocol = [];
	}
}
