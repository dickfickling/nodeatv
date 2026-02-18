/**
 * Audio sources that can provide raw PCM frames that nodeatv can stream.
 *
 * This is a stubbed implementation. Full miniaudio equivalent is deferred.
 * Currently supports:
 * - Raw PCM source (in-memory buffer)
 * - ffmpeg child_process for decoding/resampling (optional runtime dependency)
 */

import { type ChildProcess, spawn } from "node:child_process";
import type { Readable } from "node:stream";
import type { MediaMetadata } from "../../interface.js";

export const FRAMES_PER_PACKET = 352;

const EMPTY_METADATA: MediaMetadata = {};

/**
 * Abstract audio source that returns raw PCM frames.
 */
export interface AudioSource {
	/** Close underlying resources. */
	close(): Promise<void>;

	/** Read number of frames and advance in stream.
	 * Frames are returned in big-endian (network byte order) to match what AirPlay expects.
	 */
	readframes(nframes: number): Promise<Buffer>;

	/** Return media metadata if available and possible. */
	getMetadata(): Promise<MediaMetadata>;

	/** Sample rate in Hz. */
	readonly sampleRate: number;

	/** Number of audio channels. */
	readonly channels: number;

	/** Number of bytes per sample. */
	readonly sampleSize: number;

	/** Duration in seconds. */
	readonly duration: number;
}

/** Sentinel value for empty frames. */
export const NO_FRAMES = Buffer.alloc(0);

/**
 * Audio source for raw PCM data already in the correct format.
 */
export class RawPcmSource implements AudioSource {
	private _data: Buffer;
	private _pos = 0;
	private _sampleRate: number;
	private _channels: number;
	private _sampleSize: number;
	private _duration: number;

	constructor(
		data: Buffer,
		sampleRate: number,
		channels: number,
		sampleSize: number,
	) {
		this._data = data;
		this._sampleRate = sampleRate;
		this._channels = channels;
		this._sampleSize = sampleSize;
		const bytesPerFrame = channels * sampleSize;
		const totalFrames = bytesPerFrame > 0 ? data.length / bytesPerFrame : 0;
		this._duration = Math.ceil(totalFrames / sampleRate);
	}

	async close(): Promise<void> {
		// Nothing to clean up
	}

	async readframes(nframes: number): Promise<Buffer> {
		if (this._pos >= this._data.length) {
			return NO_FRAMES;
		}

		const bytesToRead = this._sampleSize * this._channels * nframes;
		const end = Math.min(this._data.length, this._pos + bytesToRead);
		const data = this._data.subarray(this._pos, end);
		this._pos = end;
		return data;
	}

	async getMetadata(): Promise<MediaMetadata> {
		return EMPTY_METADATA;
	}

	get sampleRate(): number {
		return this._sampleRate;
	}

	get channels(): number {
		return this._channels;
	}

	get sampleSize(): number {
		return this._sampleSize;
	}

	get duration(): number {
		return this._duration;
	}
}

/**
 * Audio source that uses ffmpeg to decode and resample audio files.
 *
 * Requires ffmpeg to be installed and available in PATH.
 * This is an optional runtime dependency.
 */
export class FfmpegSource implements AudioSource {
	private _process: ChildProcess | null = null;
	private _stdout: Readable | null = null;
	private _sampleRate: number;
	private _channels: number;
	private _sampleSize: number;
	private _duration = 0;
	private _buffer: Buffer = Buffer.alloc(0);
	private _eof = false;
	private _pendingResolve: (() => void) | null = null;

	constructor(sampleRate: number, channels: number, sampleSize: number) {
		this._sampleRate = sampleRate;
		this._channels = channels;
		this._sampleSize = sampleSize;
	}

	/**
	 * Open an audio file using ffmpeg for decoding.
	 */
	static async open(
		filename: string,
		sampleRate: number,
		channels: number,
		sampleSize: number,
	): Promise<FfmpegSource> {
		const source = new FfmpegSource(sampleRate, channels, sampleSize);

		// Determine PCM format for ffmpeg
		const formatMap: Record<number, string> = {
			1: "u8",
			2: "s16be",
			3: "s24be",
			4: "s32be",
		};
		const pcmFormat = formatMap[sampleSize] ?? "s16be";

		source._process = spawn(
			"ffmpeg",
			[
				"-i",
				filename,
				"-f",
				`${pcmFormat}`,
				"-acodec",
				`pcm_${pcmFormat}`,
				"-ar",
				String(sampleRate),
				"-ac",
				String(channels),
				"-",
			],
			{
				stdio: ["pipe", "pipe", "pipe"],
			},
		);

		source._stdout = source._process.stdout;

		if (source._stdout) {
			source._stdout.on("data", (chunk: Buffer) => {
				source._buffer = Buffer.concat([source._buffer, chunk]);
				if (source._pendingResolve) {
					const resolve = source._pendingResolve;
					source._pendingResolve = null;
					resolve();
				}
			});

			source._stdout.on("end", () => {
				source._eof = true;
				if (source._pendingResolve) {
					const resolve = source._pendingResolve;
					source._pendingResolve = null;
					resolve();
				}
			});
		}

		return source;
	}

	async close(): Promise<void> {
		if (this._process) {
			this._process.kill();
			this._process = null;
		}
		this._stdout = null;
	}

	async readframes(nframes: number): Promise<Buffer> {
		const bytesToRead = this._sampleSize * this._channels * nframes;

		// Wait for enough data or EOF
		while (this._buffer.length < bytesToRead && !this._eof) {
			await new Promise<void>((resolve) => {
				this._pendingResolve = resolve;
			});
		}

		if (this._buffer.length === 0) {
			return NO_FRAMES;
		}

		const available = Math.min(bytesToRead, this._buffer.length);
		const data = this._buffer.subarray(0, available);
		this._buffer = this._buffer.subarray(available);
		return data;
	}

	async getMetadata(): Promise<MediaMetadata> {
		return EMPTY_METADATA;
	}

	get sampleRate(): number {
		return this._sampleRate;
	}

	get channels(): number {
		return this._channels;
	}

	get sampleSize(): number {
		return this._sampleSize;
	}

	get duration(): number {
		return this._duration;
	}
}

/**
 * Create an AudioSource from given input source.
 *
 * Supports:
 * - Local file paths (decoded via ffmpeg)
 * - Buffer (treated as raw PCM)
 */
export async function openSource(
	source: string | Buffer,
	sampleRate: number,
	channels: number,
	sampleSize: number,
): Promise<AudioSource> {
	if (typeof source === "string") {
		return FfmpegSource.open(source, sampleRate, channels, sampleSize);
	}

	return new RawPcmSource(source, sampleRate, channels, sampleSize);
}
