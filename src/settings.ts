import { randomBytes } from "node:crypto";
import { z } from "zod";

const MAC_REGEX = /^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}$/;

export const DEFAULT_NAME = "nodeatv";
export const DEFAULT_MAC = "02:70:79:61:74:76";
export const DEFAULT_DEVICE_ID = "FF:70:79:61:74:76";
export const DEFAULT_RP_ID = "cafecafecafe";
export const DEFAULT_MODEL = "iPhone10,6";
export const DEFAULT_OS_NAME = "iPhone OS";
export const DEFAULT_OS_BUILD = "18G82";
export const DEFAULT_OS_VERSION = "14.7.1";

export enum AirPlayVersion {
	Auto = "auto",
	V1 = "1",
	V2 = "2",
}

export enum MrpTunnel {
	Auto = "auto",
	Force = "force",
	Disable = "disable",
}

const infoSettingsSchema = z.object({
	name: z.string().default(DEFAULT_NAME),
	mac: z
		.string()
		.default(DEFAULT_MAC)
		.refine((mac: string) => MAC_REGEX.test(mac), {
			message: "not a valid MAC address",
		}),
	model: z.string().default(DEFAULT_MODEL),
	deviceId: z.string().default(DEFAULT_DEVICE_ID),
	rpId: z
		.string()
		.nullable()
		.default(null)
		.transform((v: string | null) => v ?? randomBytes(6).toString("hex")),
	osName: z.string().default(DEFAULT_OS_NAME),
	osBuild: z.string().default(DEFAULT_OS_BUILD),
	osVersion: z.string().default(DEFAULT_OS_VERSION),
});

const airPlaySettingsSchema = z.object({
	identifier: z.string().nullable().default(null),
	credentials: z.string().nullable().default(null),
	password: z.string().nullable().default(null),
	mrpTunnel: z.nativeEnum(MrpTunnel).default(MrpTunnel.Auto),
});

const companionSettingsSchema = z.object({
	identifier: z.string().nullable().default(null),
	credentials: z.string().nullable().default(null),
});

const dmapSettingsSchema = z.object({
	identifier: z.string().nullable().default(null),
	credentials: z.string().nullable().default(null),
});

const mrpSettingsSchema = z.object({
	identifier: z.string().nullable().default(null),
	credentials: z.string().nullable().default(null),
});

const raopSettingsSchema = z.object({
	identifier: z.string().nullable().default(null),
	credentials: z.string().nullable().default(null),
	password: z.string().nullable().default(null),
	protocolVersion: z.nativeEnum(AirPlayVersion).default(AirPlayVersion.Auto),
	timingPort: z.number().int().default(0),
	controlPort: z.number().int().default(0),
});

const protocolSettingsSchema = z.object({
	airplay: airPlaySettingsSchema.default(() => airPlaySettingsSchema.parse({})),
	companion: companionSettingsSchema.default(() =>
		companionSettingsSchema.parse({}),
	),
	dmap: dmapSettingsSchema.default(() => dmapSettingsSchema.parse({})),
	mrp: mrpSettingsSchema.default(() => mrpSettingsSchema.parse({})),
	raop: raopSettingsSchema.default(() => raopSettingsSchema.parse({})),
});

const settingsSchema = z.object({
	info: infoSettingsSchema.default(() => infoSettingsSchema.parse({})),
	protocols: protocolSettingsSchema.default(() =>
		protocolSettingsSchema.parse({}),
	),
});

export type InfoSettings = z.infer<typeof infoSettingsSchema>;
export type AirPlaySettings = z.infer<typeof airPlaySettingsSchema>;
export type CompanionSettings = z.infer<typeof companionSettingsSchema>;
export type DmapSettings = z.infer<typeof dmapSettingsSchema>;
export type MrpSettings = z.infer<typeof mrpSettingsSchema>;
export type RaopSettings = z.infer<typeof raopSettingsSchema>;
export type ProtocolSettings = z.infer<typeof protocolSettingsSchema>;
export type Settings = z.infer<typeof settingsSchema>;

export {
	infoSettingsSchema,
	airPlaySettingsSchema,
	companionSettingsSchema,
	dmapSettingsSchema,
	mrpSettingsSchema,
	raopSettingsSchema,
	protocolSettingsSchema,
	settingsSchema,
};

export function createSettings(
	input?: Partial<z.input<typeof settingsSchema>>,
): Settings {
	return settingsSchema.parse(input ?? {});
}
