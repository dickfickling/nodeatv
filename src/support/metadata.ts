import type { MediaMetadata } from "../interface.js";

export const EMPTY_METADATA: MediaMetadata = {
	title: null,
	artist: null,
	album: null,
	duration: null,
};

export async function getMetadata(_file: string): Promise<MediaMetadata> {
	// Stubbed: music-metadata dependency not included.
	// Return empty metadata for now.
	return { ...EMPTY_METADATA };
}

export function mergeInto(
	base: MediaMetadata,
	newMetadata: MediaMetadata,
): MediaMetadata {
	const fields: (keyof MediaMetadata)[] = [
		"title",
		"artist",
		"album",
		"duration",
	];
	for (const field of fields) {
		if (base[field] === null || base[field] === undefined) {
			(base as Record<string, unknown>)[field] = newMetadata[field];
		}
	}
	return base;
}
