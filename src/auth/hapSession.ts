import { Chacha20Cipher } from "../support/chacha20.js";

export class HAPSession {
	static readonly FRAME_LENGTH = 1024;
	static readonly AUTH_TAG_LENGTH = 16;

	private _encryptedData: Buffer = Buffer.alloc(0);
	chacha20: Chacha20Cipher | null = null;

	enable(outputKey: Buffer, inputKey: Buffer): void {
		this.chacha20 = new Chacha20Cipher(outputKey, inputKey);
	}

	decrypt(data: Buffer): Buffer {
		if (!this.chacha20) return data;

		this._encryptedData = Buffer.concat([this._encryptedData, data]);

		let output = Buffer.alloc(0);
		while (this._encryptedData.length > 0) {
			const length = this._encryptedData.subarray(0, 2);
			const blockLength = length.readUInt16LE(0) + HAPSession.AUTH_TAG_LENGTH;
			if (this._encryptedData.length < blockLength + 2) {
				return output;
			}

			const block = this._encryptedData.subarray(2, 2 + blockLength);
			output = Buffer.concat([
				output,
				this.chacha20.decrypt(block, undefined, length),
			]);
			this._encryptedData = this._encryptedData.subarray(2 + blockLength);
		}
		return output;
	}

	encrypt(data: Buffer): Buffer {
		if (!this.chacha20) return data;

		let output = Buffer.alloc(0);
		let remaining = data;
		while (remaining.length > 0) {
			const frame = remaining.subarray(0, HAPSession.FRAME_LENGTH);
			remaining = remaining.subarray(HAPSession.FRAME_LENGTH);

			const length = Buffer.alloc(2);
			length.writeUInt16LE(frame.length, 0);
			const encrypted = this.chacha20.encrypt(frame, undefined, length);
			output = Buffer.concat([output, length, encrypted]);
		}
		return output;
	}
}
