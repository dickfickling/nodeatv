import { DeviceModel, OperatingSystem } from "../const.js";

const MODEL_LIST: Record<string, DeviceModel> = {
	"AirPort4,107": DeviceModel.AirPortExpress,
	"AirPort10,115": DeviceModel.AirPortExpressGen2,
	"AppleTV1,1": DeviceModel.AppleTVGen1,
	"AppleTV2,1": DeviceModel.Gen2,
	"AppleTV3,1": DeviceModel.Gen3,
	"AppleTV3,2": DeviceModel.Gen3,
	"AppleTV5,3": DeviceModel.Gen4,
	"AppleTV6,2": DeviceModel.Gen4K,
	"AppleTV11,1": DeviceModel.AppleTV4KGen2,
	"AppleTV14,1": DeviceModel.AppleTV4KGen3,
	"AudioAccessory1,1": DeviceModel.HomePod,
	"AudioAccessory1,2": DeviceModel.HomePod,
	"AudioAccessory5,1": DeviceModel.HomePodMini,
	"AudioAccessorySingle5,1": DeviceModel.HomePodMini,
	"AudioAccessory6,1": DeviceModel.HomePodGen2,
};

const INTERNAL_NAME_LIST: Record<string, DeviceModel> = {
	K66AP: DeviceModel.Gen2,
	J33AP: DeviceModel.Gen3,
	J33IAP: DeviceModel.Gen3,
	J42dAP: DeviceModel.Gen4,
	J105aAP: DeviceModel.Gen4K,
	J305AP: DeviceModel.AppleTV4KGen2,
	J255AP: DeviceModel.AppleTV4KGen3,
};

const VERSION_LIST: Record<string, string> = {
	"17J586": "13.0",
	"17K82": "13.2",
	"17K449": "13.3",
	"17K795": "13.3.1",
	"17L256": "13.4",
	"17L562": "13.4.5",
	"17L570": "13.4.6",
	"17M61": "13.4.8",
	"18J386": "14.0",
	"18J400": "14.0.1",
	"18J411": "14.0.2",
	"18K57": "14.2",
	"18K561": "14.3",
	"18K802": "14.4",
	"18L204": "14.5",
	"18L569": "14.6",
	"18M60": "14.7",
	"19J346": "15.0",
	"19J572": "15.1",
	"19J581": "15.1.1",
	"19K53": "15.2",
	"19K547": "15.3",
	"19L440": "15.4",
	"19L452": "15.4.1",
	"19L570": "15.5",
	"19L580": "15.5.1",
	"19M65": "15.6",
	"20J373": "16.0",
	"20K71": "16.1",
	"20K80": "16.1.1",
	"20K362": "16.2",
	"20K650": "16.3",
	"20K661": "16.3.1",
	"20K672": "16.3.2",
	"20K680": "16.3.3",
	"20L497": "16.4",
	"20L498": "16.4.1",
	"20L563": "16.5",
	"20M73": "16.6",
	"22J354": "17.0",
	"21K69": "17.1",
	"21K365": "17.2",
	"21K646": "17.3",
	"21L227": "17.4",
	"21L569": "17.5",
	"21L580": "17.5.1",
	"21M71": "17.6",
	"21M80": "17.6.1",
	"22J357": "18.0",
	"22J580": "18.1",
};

const OS_IDENTIFIER_FORMATS = [
	/^MacBookAir\d+,\d+$/,
	/^iMac\d+,\d+$/,
	/^Macmini\d+,\d+$/,
	/^MacBookPro\d+,\d+$/,
	/^Mac\d+,\d+$/,
	/^MacPro\d+,\d+$/,
];

export function lookupModel(identifier: string | null): DeviceModel {
	return MODEL_LIST[identifier ?? ""] ?? DeviceModel.Unknown;
}

export function lookupInternalName(name: string | null): DeviceModel {
	return INTERNAL_NAME_LIST[name ?? ""] ?? DeviceModel.Unknown;
}

export function lookupVersion(build: string | null): string | null {
	if (!build) return null;

	const version = VERSION_LIST[build];
	if (version) return version;

	const match = build.match(/^(\d+)[A-Z]/);
	if (match) {
		const base = Number.parseInt(match[1], 10);
		return `${base - 4}.x`;
	}

	return null;
}

export function lookupOs(idOrModel: string | DeviceModel): OperatingSystem {
	if (typeof idOrModel === "string") {
		return OS_IDENTIFIER_FORMATS.some((fmt) => fmt.test(idOrModel))
			? OperatingSystem.MacOS
			: OperatingSystem.Unknown;
	}

	if (
		idOrModel === DeviceModel.AirPortExpress ||
		idOrModel === DeviceModel.AirPortExpressGen2
	) {
		return OperatingSystem.AirPortOS;
	}
	if (
		idOrModel === DeviceModel.HomePod ||
		idOrModel === DeviceModel.HomePodMini ||
		idOrModel === DeviceModel.HomePodGen2
	) {
		return OperatingSystem.TvOS;
	}
	if (
		idOrModel === DeviceModel.AppleTVGen1 ||
		idOrModel === DeviceModel.Gen2 ||
		idOrModel === DeviceModel.Gen3
	) {
		return OperatingSystem.Legacy;
	}
	if (
		idOrModel === DeviceModel.Gen4 ||
		idOrModel === DeviceModel.Gen4K ||
		idOrModel === DeviceModel.AppleTV4KGen2 ||
		idOrModel === DeviceModel.AppleTV4KGen3
	) {
		return OperatingSystem.TvOS;
	}

	return OperatingSystem.Unknown;
}
