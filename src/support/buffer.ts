import { InvalidStateError } from "../exceptions.js";

export const BUFFER_SIZE = 8192;
export const HEADROOM_SIZE = 1024;

export class SemiSeekableBuffer {
	private _buffer: Buffer;
	private _bufferSize: number;
	private _headroom: number;
	private _position: number;
	private _hasHeadroomData: boolean;
	private _protected: boolean;

	constructor(
		bufferSize: number = BUFFER_SIZE,
		seekableHeadroom: number = HEADROOM_SIZE,
		protectedHeadroom = false,
	) {
		if (seekableHeadroom > bufferSize) {
			throw new ValueError("too large seekable headroom");
		}

		this._buffer = Buffer.alloc(0);
		this._bufferSize = bufferSize;
		this._headroom = seekableHeadroom;
		this._position = 0;
		this._hasHeadroomData = true;
		this._protected = protectedHeadroom;
	}

	empty(): boolean {
		return this.size === 0;
	}

	get size(): number {
		return this._buffer.length - (this._hasHeadroomData ? this._position : 0);
	}

	get remaining(): number {
		return this._bufferSize - this.size;
	}

	get position(): number {
		return this._position;
	}

	get protectedHeadroom(): boolean {
		return this._protected;
	}

	set protectedHeadroom(protected_: boolean) {
		if (protected_ === this._protected) return;
		if (this.position !== 0) {
			throw new InvalidStateError("not a starting position");
		}
		this._protected = protected_;
	}

	add(data: Buffer): number {
		const roomInBuffer = Math.min(
			data.length,
			this._bufferSize - this._buffer.length,
		);
		this._buffer = Buffer.concat([
			this._buffer,
			data.subarray(0, roomInBuffer),
		]);
		return roomInBuffer;
	}

	get(numberOfBytes: number): Buffer {
		let data: Buffer;
		if (this._hasHeadroomData) {
			data = this._buffer.subarray(
				this._position,
				this._position + numberOfBytes,
			);
		} else {
			data = this._buffer.subarray(0, numberOfBytes);
		}

		this._position += data.length;

		if (!this.protectedHeadroom) {
			if (this._hasHeadroomData) {
				if (this._position >= this._headroom) {
					this._hasHeadroomData = false;
					this._buffer = this._buffer.subarray(this._position);
				}
			} else {
				this._buffer = this._buffer.subarray(data.length);
			}
		}

		return data;
	}

	seek(position: number): boolean {
		if (position === this.position) return true;
		if (!this._hasHeadroomData) return false;
		if (position >= this._headroom) return false;

		const headroomDataInBuffer = Math.min(this._headroom, this._buffer.length);
		if (position > headroomDataInBuffer - 1) return false;

		this._position = position;
		return true;
	}

	fits(data: Buffer | number): boolean {
		const inSize = typeof data === "number" ? data : data.length;
		return this._buffer.length + inSize <= this._bufferSize;
	}

	get length(): number {
		return this.size;
	}
}

class ValueError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "ValueError";
	}
}
