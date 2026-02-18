import { AbstractStorage } from "./abstractStorage.js";

export class MemoryStorage extends AbstractStorage {
	async save(): Promise<void> {
		this.updateHash(this.toJSON());
	}

	async load(): Promise<void> {
		// Nothing to load for in-memory storage
	}

	toString(): string {
		return "MemoryStorage";
	}
}
