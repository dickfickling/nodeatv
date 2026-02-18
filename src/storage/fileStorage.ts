import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { AbstractStorage } from "./abstractStorage.js";

export class FileStorage extends AbstractStorage {
	private _filename: string;

	constructor(filename: string) {
		super();
		this._filename = filename;
	}

	static defaultStorage(): FileStorage {
		return new FileStorage(join(homedir(), ".nodeatv.conf"));
	}

	async save(): Promise<void> {
		const dumped = this.toJSON();
		if (this.hasChanged(dumped)) {
			await writeFile(this._filename, `${JSON.stringify(dumped)}\n`, "utf-8");
			this.updateHash(dumped);
		}
	}

	async load(): Promise<void> {
		if (!existsSync(this._filename)) return;

		const content = await readFile(this._filename, "utf-8");
		const rawData = JSON.parse(content);
		this.storageModel = rawData;
		this.updateHash(rawData);
	}

	toString(): string {
		return `FileStorage:${this._filename}`;
	}
}
