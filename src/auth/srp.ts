/**
 * SRP6a implementation using Node.js crypto module.
 *
 * Implements the Secure Remote Password protocol (RFC 5054) with:
 * - 3072-bit prime from RFC 5054
 * - SHA-512 hash function
 * - Both client and server sessions
 *
 * Matches the behavior of Python's srptools library used by pyatv.
 */

import * as crypto from "node:crypto";

// RFC 5054 3072-bit prime
const PRIME_3072_HEX =
	"FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E08" +
	"8A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B" +
	"302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9" +
	"A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE6" +
	"49286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8" +
	"FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D" +
	"670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C" +
	"180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718" +
	"3995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D" +
	"04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7D" +
	"B3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D22" +
	"61AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200" +
	"CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BF" +
	"CE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF";

export const PRIME_3072 = BigInt(`0x${PRIME_3072_HEX}`);
export const PRIME_3072_GEN = 5n;

function bigintToBuffer(n: bigint): Buffer {
	let hex = n.toString(16);
	if (hex.length % 2 !== 0) hex = `0${hex}`;
	return Buffer.from(hex, "hex");
}

function bufferToBigint(buf: Buffer): bigint {
	if (buf.length === 0) return 0n;
	return BigInt(`0x${buf.toString("hex")}`);
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
	let result = 1n;
	base = ((base % mod) + mod) % mod;
	while (exp > 0n) {
		if (exp & 1n) {
			result = (result * base) % mod;
		}
		exp >>= 1n;
		base = (base * base) % mod;
	}
	return result;
}

function hashSha512(...buffers: Buffer[]): Buffer {
	const h = crypto.createHash("sha512");
	for (const b of buffers) {
		h.update(b);
	}
	return h.digest();
}

function padToN(n: bigint, prime: bigint): Buffer {
	const primeBytes = bigintToBuffer(prime);
	const nBuf = bigintToBuffer(n);
	if (nBuf.length >= primeBytes.length) return nBuf;
	const padded = Buffer.alloc(primeBytes.length);
	nBuf.copy(padded, primeBytes.length - nBuf.length);
	return padded;
}

function computeK(prime: bigint, gen: bigint): bigint {
	const N = bigintToBuffer(prime);
	const g = padToN(gen, prime);
	return bufferToBigint(hashSha512(N, g));
}

function computeU(A: bigint, B: bigint, prime: bigint): bigint {
	const paddedA = padToN(A, prime);
	const paddedB = padToN(B, prime);
	return bufferToBigint(hashSha512(paddedA, paddedB));
}

function computeX(salt: Buffer, username: string, password: string): bigint {
	const identityHash = hashSha512(Buffer.from(`${username}:${password}`));
	return bufferToBigint(hashSha512(salt, identityHash));
}

function computeVerifier(x: bigint, prime: bigint, gen: bigint): bigint {
	return modPow(gen, x, prime);
}

function computeClientM(
	prime: bigint,
	gen: bigint,
	username: string,
	salt: Buffer,
	A: bigint,
	B: bigint,
	K: Buffer,
): Buffer {
	const hN = hashSha512(bigintToBuffer(prime));
	const hg = hashSha512(bigintToBuffer(gen));
	const hNxorHg = Buffer.alloc(hN.length);
	for (let i = 0; i < hN.length; i++) {
		hNxorHg[i] = hN[i] ^ hg[i];
	}
	const hI = hashSha512(Buffer.from(username));
	return hashSha512(hNxorHg, hI, salt, bigintToBuffer(A), bigintToBuffer(B), K);
}

function computeServerM(A: bigint, M: Buffer, K: Buffer): Buffer {
	return hashSha512(bigintToBuffer(A), M, K);
}

export interface SRPContext {
	username: string;
	password: string;
	prime: bigint;
	generator: bigint;
}

export function createSRPContext(
	username: string,
	password: string,
	prime = PRIME_3072,
	generator = PRIME_3072_GEN,
): SRPContext {
	return { username, password, prime, generator };
}

export class SRPClientSession {
	private _context: SRPContext;
	private _privateKey: bigint;
	private _publicKey: bigint;
	private _sessionKey: Buffer | null = null;
	private _clientProof: Buffer | null = null;

	constructor(context: SRPContext, privateKey?: Buffer) {
		this._context = context;
		if (privateKey) {
			this._privateKey = bufferToBigint(privateKey);
		} else {
			this._privateKey = bufferToBigint(crypto.randomBytes(32));
		}
		this._publicKey = modPow(
			context.generator,
			this._privateKey,
			context.prime,
		);
	}

	get public(): string {
		return bigintToBuffer(this._publicKey).toString("hex");
	}

	get key(): string {
		if (!this._sessionKey) {
			throw new Error("SRP session not processed yet");
		}
		return this._sessionKey.toString("hex");
	}

	get keyBytes(): Buffer {
		if (!this._sessionKey) {
			throw new Error("SRP session not processed yet");
		}
		return this._sessionKey;
	}

	get keyProofHash(): string {
		if (!this._clientProof) {
			throw new Error("SRP session not processed yet");
		}
		return this._clientProof.toString("hex");
	}

	get keyProofHashBytes(): Buffer {
		if (!this._clientProof) {
			throw new Error("SRP session not processed yet");
		}
		return this._clientProof;
	}

	process(serverPubKeyHex: string, saltHex: string): void {
		const { username, password, prime, generator } = this._context;
		const B = BigInt(`0x${serverPubKeyHex}`);
		const salt = Buffer.from(saltHex, "hex");

		if (B % prime === 0n) {
			throw new Error("Server public key is invalid (zero mod N)");
		}

		const u = computeU(this._publicKey, B, prime);
		if (u === 0n) {
			throw new Error("u value is zero");
		}

		const k = computeK(prime, generator);
		const x = computeX(salt, username, password);

		// S = (B - k*g^x)^(a + u*x) mod N
		const gx = modPow(generator, x, prime);
		let base = (B - k * gx) % prime;
		if (base < 0n) base += prime;
		const exp = this._privateKey + u * x;
		const S = modPow(base, exp, prime);

		this._sessionKey = hashSha512(bigintToBuffer(S));
		this._clientProof = computeClientM(
			prime,
			generator,
			username,
			salt,
			this._publicKey,
			B,
			this._sessionKey,
		);
	}

	verifyProof(serverProofHex: string): boolean {
		if (!this._sessionKey || !this._clientProof) {
			throw new Error("Must call process() before verifyProof()");
		}
		const expected = computeServerM(
			this._publicKey,
			this._clientProof,
			this._sessionKey,
		);
		return expected.toString("hex") === serverProofHex;
	}
}

export class SRPServerSession {
	private _context: SRPContext;
	private _privateKey: bigint;
	private _publicKey: bigint;
	private _salt: Buffer;
	private _verifier: bigint;
	private _sessionKey: Buffer | null = null;
	private _serverProof: Buffer | null = null;

	constructor(context: SRPContext, privateKey?: Buffer) {
		this._context = context;
		if (privateKey) {
			this._privateKey = bufferToBigint(privateKey);
		} else {
			this._privateKey = bufferToBigint(crypto.randomBytes(32));
		}

		this._salt = crypto.randomBytes(16);
		const x = computeX(this._salt, context.username, context.password);
		this._verifier = computeVerifier(x, context.prime, context.generator);

		const k = computeK(context.prime, context.generator);
		// B = (k*v + g^b) mod N
		this._publicKey =
			(k * this._verifier +
				modPow(context.generator, this._privateKey, context.prime)) %
			context.prime;
	}

	get public(): string {
		return bigintToBuffer(this._publicKey).toString("hex");
	}

	get publicBytes(): Buffer {
		return bigintToBuffer(this._publicKey);
	}

	get salt(): string {
		return this._salt.toString("hex");
	}

	get saltBytes(): Buffer {
		return this._salt;
	}

	get key(): string {
		if (!this._sessionKey) {
			throw new Error("SRP server session not processed yet");
		}
		return this._sessionKey.toString("hex");
	}

	get keyBytes(): Buffer {
		if (!this._sessionKey) {
			throw new Error("SRP server session not processed yet");
		}
		return this._sessionKey;
	}

	get keyProofHash(): string {
		if (!this._serverProof) {
			throw new Error("SRP server session not processed yet");
		}
		return this._serverProof.toString("hex");
	}

	get keyProofHashBytes(): Buffer {
		if (!this._serverProof) {
			throw new Error("SRP server session not processed yet");
		}
		return this._serverProof;
	}

	processAndVerify(clientPubKeyHex: string, clientProofHex: string): boolean {
		const { username, prime, generator } = this._context;
		const A = BigInt(`0x${clientPubKeyHex}`);

		if (A % prime === 0n) {
			throw new Error("Client public key is invalid (zero mod N)");
		}

		const u = computeU(A, this._publicKey, prime);
		if (u === 0n) {
			throw new Error("u value is zero");
		}

		const vu = modPow(this._verifier, u, prime);
		const S = modPow(A * vu, this._privateKey, prime);

		this._sessionKey = hashSha512(bigintToBuffer(S));

		const expectedClientM = computeClientM(
			prime,
			generator,
			username,
			this._salt,
			A,
			this._publicKey,
			this._sessionKey,
		);

		if (expectedClientM.toString("hex") !== clientProofHex) {
			return false;
		}

		this._serverProof = computeServerM(A, expectedClientM, this._sessionKey);
		return true;
	}
}

export { bigintToBuffer, bufferToBigint };
