import { createCipheriv, createDecipheriv } from "node:crypto";

export const NONCE_LENGTH = 12;

export class Chacha20Cipher {
	private _outKey: Buffer;
	private _inKey: Buffer;
	protected _outCounter: number;
	protected _inCounter: number;
	private _nonceLength: number;

	constructor(outKey: Buffer, inKey: Buffer, nonceLength = 8) {
		this._outKey = Buffer.from(outKey);
		this._inKey = Buffer.from(inKey);
		this._outCounter = 0;
		this._inCounter = 0;
		this._nonceLength = nonceLength;
	}

	get outNonce(): Buffer {
		const nonce = Buffer.alloc(this._nonceLength);
		nonce.writeUIntLE(this._outCounter, 0, Math.min(this._nonceLength, 6));
		if (this._nonceLength !== NONCE_LENGTH) {
			return this._padNonce(nonce);
		}
		return nonce;
	}

	get inNonce(): Buffer {
		const nonce = Buffer.alloc(this._nonceLength);
		nonce.writeUIntLE(this._inCounter, 0, Math.min(this._nonceLength, 6));
		if (this._nonceLength !== NONCE_LENGTH) {
			return this._padNonce(nonce);
		}
		return nonce;
	}

	private _padNonce(nonce: Buffer): Buffer {
		const padded = Buffer.alloc(NONCE_LENGTH);
		nonce.copy(padded, NONCE_LENGTH - nonce.length);
		return padded;
	}

	encrypt(data: Buffer, nonce?: Buffer, aad?: Buffer): Buffer {
		let actualNonce: Buffer;
		if (!nonce) {
			actualNonce = this.outNonce;
			this._outCounter++;
		} else if (nonce.length < NONCE_LENGTH) {
			actualNonce = this._padNonce(nonce);
		} else {
			actualNonce = nonce;
		}

		const cipher = createCipheriv(
			"chacha20-poly1305",
			this._outKey,
			actualNonce,
			{ authTagLength: 16 },
		);
		if (aad) cipher.setAAD(aad, { plaintextLength: data.length });
		const encrypted = cipher.update(data);
		cipher.final();
		const tag = cipher.getAuthTag();
		return Buffer.concat([encrypted, tag]);
	}

	decrypt(data: Buffer, nonce?: Buffer, aad?: Buffer): Buffer {
		let actualNonce: Buffer;
		if (!nonce) {
			actualNonce = this.inNonce;
			this._inCounter++;
		} else if (nonce.length < NONCE_LENGTH) {
			actualNonce = this._padNonce(nonce);
		} else {
			actualNonce = nonce;
		}

		const tag = data.subarray(data.length - 16);
		const ciphertext = data.subarray(0, data.length - 16);

		const decipher = createDecipheriv(
			"chacha20-poly1305",
			this._inKey,
			actualNonce,
			{ authTagLength: 16 },
		);
		if (aad) decipher.setAAD(aad, { plaintextLength: ciphertext.length });
		decipher.setAuthTag(tag);
		const decrypted = decipher.update(ciphertext);
		decipher.final();
		return decrypted;
	}
}

export class Chacha20Cipher8byteNonce extends Chacha20Cipher {
	constructor(outKey: Buffer, inKey: Buffer) {
		super(outKey, inKey, 8);
	}

	get outNonce(): Buffer {
		const nonce = Buffer.alloc(NONCE_LENGTH);
		// First 4 bytes zero, then 8-byte counter in LE
		nonce.writeUInt32LE(this._outCounter, 4);
		return nonce;
	}

	get inNonce(): Buffer {
		const nonce = Buffer.alloc(NONCE_LENGTH);
		nonce.writeUInt32LE(this._inCounter, 4);
		return nonce;
	}
}
