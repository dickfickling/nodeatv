export function dictMerge<K, V>(
	dictA: Map<K, V>,
	dictB: ReadonlyMap<K, V>,
	allowOverwrite = false,
): Map<K, V> {
	for (const [key, value] of dictB) {
		if (allowOverwrite || !dictA.has(key)) {
			dictA.set(key, value);
		}
	}
	return dictA;
}

export function dictSubtract(
	dictA: Record<string, unknown>,
	dictB: Record<string, unknown>,
	removeIfSameValue = false,
): Record<string, unknown> {
	const diff: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(dictA)) {
		if (
			typeof val === "object" &&
			val !== null &&
			!Array.isArray(val) &&
			key in dictB
		) {
			diff[key] = dictSubtract(
				val as Record<string, unknown>,
				dictB[key] as Record<string, unknown>,
			);
		} else if (
			!(key in dictB) ||
			(removeIfSameValue && dictA[key] !== dictB[key])
		) {
			diff[key] = val;
		}
	}
	return diff;
}

export class CaseInsensitiveDict<T> implements Iterable<[string, T]> {
	private _data: Map<string, T>;

	constructor(
		init?: Map<string, T> | Record<string, T> | Iterable<[string, T]> | null,
	) {
		this._data = new Map();
		if (init) {
			if (init instanceof Map) {
				for (const [key, value] of init) {
					this._data.set(key.toLowerCase(), value);
				}
			} else if (typeof init === "object" && !(Symbol.iterator in init)) {
				for (const [key, value] of Object.entries(init as Record<string, T>)) {
					this._data.set(key.toLowerCase(), value);
				}
			} else {
				for (const [key, value] of init as Iterable<[string, T]>) {
					this._data.set(key.toLowerCase(), value);
				}
			}
		}
	}

	get(key: string): T | undefined {
		return this._data.get(key.toLowerCase());
	}

	set(key: string, value: T): void {
		this._data.set(key.toLowerCase(), value);
	}

	delete(key: string): boolean {
		return this._data.delete(key.toLowerCase());
	}

	has(key: string): boolean {
		return this._data.has(key.toLowerCase());
	}

	get size(): number {
		return this._data.size;
	}

	[Symbol.iterator](): Iterator<[string, T]> {
		return this._data[Symbol.iterator]();
	}

	keys(): IterableIterator<string> {
		return this._data.keys();
	}

	values(): IterableIterator<T> {
		return this._data.values();
	}

	entries(): IterableIterator<[string, T]> {
		return this._data.entries();
	}

	equals(other: CaseInsensitiveDict<T> | Map<string, T>): boolean {
		if (other instanceof CaseInsensitiveDict) {
			if (this._data.size !== other._data.size) return false;
			for (const [key, value] of this._data) {
				if (!other._data.has(key) || other._data.get(key) !== value)
					return false;
			}
			return true;
		}
		if (other instanceof Map) {
			if (this._data.size !== other.size) return false;
			for (const [key, value] of other) {
				if (this._data.get(key.toLowerCase()) !== value) return false;
			}
			return true;
		}
		return false;
	}

	toString(): string {
		const entries = [...this._data.entries()]
			.map(([k, v]) => `${k}: ${v}`)
			.join(", ");
		return `{ ${entries} }`;
	}
}

export class SharedData<T> {
	private _resolve: ((value: T) => void) | null = null;
	private _promise: Promise<T>;

	constructor() {
		this._promise = new Promise<T>((resolve) => {
			this._resolve = resolve;
		});
	}

	async wait(timeout = 5000): Promise<T> {
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error("SharedData wait timed out")), timeout);
		});
		return Promise.race([this._promise, timeoutPromise]);
	}

	set(data: T): void {
		this._resolve?.(data);
	}
}
