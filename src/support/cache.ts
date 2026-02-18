export class Cache<T> {
	readonly limit: number;
	private data: Map<string, T>;

	constructor(limit = 16) {
		this.limit = limit;
		this.data = new Map();
	}

	empty(): boolean {
		return this.data.size === 0;
	}

	put(identifier: string, data: T): void {
		if (this.data.has(identifier)) {
			this.data.delete(identifier);
		} else if (this.data.size >= this.limit) {
			const firstKey = this.data.keys().next().value as string;
			this.data.delete(firstKey);
		}
		this.data.set(identifier, data);
	}

	get(identifier: string): T {
		if (!this.data.has(identifier)) {
			throw new Error(`Key not found: ${identifier}`);
		}
		const value = this.data.get(identifier) as T;
		this.data.delete(identifier);
		this.data.set(identifier, value);
		return value;
	}

	latest(): string | null {
		if (this.empty()) return null;
		const keys = [...this.data.keys()];
		return keys[keys.length - 1];
	}

	has(identifier: string): boolean {
		return this.data.has(identifier);
	}

	get size(): number {
		return this.data.size;
	}
}
