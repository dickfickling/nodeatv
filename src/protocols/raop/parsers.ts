/**
 * Utility methods for parsing various kinds of data.
 */

import { ProtocolError } from "../../exceptions.js";

export const DEFAULT_SAMPLE_RATE = 44100;
export const DEFAULT_SAMPLE_SIZE = 16; // bits
export const DEFAULT_CHANNELS = 2;

export enum EncryptionType {
	Unknown = 0,
	Unencrypted = 1,
	RSA = 2,
	FairPlay = 4,
	MFiSAP = 8,
	FairPlaySAPv25 = 16,
}

export enum MetadataType {
	NotSupported = 0,
	Text = 1,
	Artwork = 2,
	Progress = 4,
}

/**
 * Parse Zeroconf properties and return sample rate, channels and sample size.
 */
export function getAudioProperties(
	properties: Record<string, string>,
): [number, number, number] {
	try {
		const sampleRate = Number.parseInt(
			properties.sr ?? String(DEFAULT_SAMPLE_RATE),
			10,
		);
		const channels = Number.parseInt(
			properties.ch ?? String(DEFAULT_CHANNELS),
			10,
		);
		const sampleSize = Math.floor(
			Number.parseInt(properties.ss ?? String(DEFAULT_SAMPLE_SIZE), 10) / 8,
		);
		return [sampleRate, channels, sampleSize];
	} catch {
		throw new ProtocolError("invalid audio property");
	}
}

const ENCRYPTION_MAP: Record<number, EncryptionType> = {
	0: EncryptionType.Unencrypted,
	1: EncryptionType.RSA,
	3: EncryptionType.FairPlay,
	4: EncryptionType.MFiSAP,
	5: EncryptionType.FairPlaySAPv25,
};

/**
 * Return encryption types supported by receiver.
 *
 * Input format from zeroconf is a comma separated list:
 *   et=0,1,3
 *
 * 0=unencrypted, 1=RSA, 3=FairPlay, 4=MFiSAP, 5=FairPlay SAPv2.5
 */
export function getEncryptionTypes(
	properties: Record<string, string>,
): EncryptionType {
	let output: EncryptionType = EncryptionType.Unknown;
	try {
		const etValue = properties.et;
		if (etValue === undefined) return output;
		const encTypes = etValue.split(",").map((x) => Number.parseInt(x, 10));
		for (const encType of encTypes) {
			output |= ENCRYPTION_MAP[encType] ?? EncryptionType.Unknown;
		}
	} catch {
		return output;
	}
	return output;
}

const METADATA_MAP: Record<number, MetadataType> = {
	0: MetadataType.Text,
	1: MetadataType.Artwork,
	2: MetadataType.Progress,
};

/**
 * Return metadata types supported by receiver.
 *
 * Input format from zeroconf is comma separated list:
 *   md=0,1,2
 *
 * 0=text, 1=artwork, 2=progress
 */
export function getMetadataTypes(
	properties: Record<string, string>,
): MetadataType {
	let output: MetadataType = MetadataType.NotSupported;
	try {
		const mdValue = properties.md;
		if (mdValue === undefined) return output;
		const mdTypes = mdValue.split(",").map((x) => Number.parseInt(x, 10));
		for (const mdType of mdTypes) {
			output |= METADATA_MAP[mdType] ?? MetadataType.NotSupported;
		}
	} catch {
		return output;
	}
	return output;
}
