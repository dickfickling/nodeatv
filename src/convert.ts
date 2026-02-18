import {
	DeviceModel,
	DeviceState,
	MediaType,
	Protocol,
	RepeatState,
	ShuffleState,
} from "./const.js";

export function deviceStateStr(state: DeviceState | null): string {
	const map: Record<number, string> = {
		[DeviceState.Idle]: "Idle",
		[DeviceState.Loading]: "Loading",
		[DeviceState.Stopped]: "Stopped",
		[DeviceState.Paused]: "Paused",
		[DeviceState.Playing]: "Playing",
		[DeviceState.Seeking]: "Seeking",
	};
	if (state === null) return "Idle";
	return map[state] ?? "Unsupported";
}

export function mediaTypeStr(mediaType: MediaType): string {
	const map: Record<number, string> = {
		[MediaType.Unknown]: "Unknown",
		[MediaType.Video]: "Video",
		[MediaType.Music]: "Music",
		[MediaType.TV]: "TV",
	};
	return map[mediaType] ?? "Unsupported";
}

export function repeatStr(state: RepeatState): string {
	const map: Record<number, string> = {
		[RepeatState.Off]: "Off",
		[RepeatState.Track]: "Track",
		[RepeatState.All]: "All",
	};
	return map[state] ?? "Unsupported";
}

export function shuffleStr(state: ShuffleState): string {
	const map: Record<number, string> = {
		[ShuffleState.Off]: "Off",
		[ShuffleState.Albums]: "Albums",
		[ShuffleState.Songs]: "Songs",
	};
	return map[state] ?? "Unsupported";
}

export function protocolStr(protocol: Protocol): string {
	const map: Record<number, string> = {
		[Protocol.MRP]: "MRP",
		[Protocol.DMAP]: "DMAP",
		[Protocol.AirPlay]: "AirPlay",
		[Protocol.Companion]: "Companion",
		[Protocol.RAOP]: "RAOP",
	};
	return map[protocol] ?? "Unknown";
}

export function modelStr(deviceModel: DeviceModel): string {
	const map: Record<number, string> = {
		[DeviceModel.AppleTVGen1]: "Apple TV 1",
		[DeviceModel.Gen2]: "Apple TV 2",
		[DeviceModel.Gen3]: "Apple TV 3",
		[DeviceModel.Gen4]: "Apple TV 4",
		[DeviceModel.Gen4K]: "Apple TV 4K",
		[DeviceModel.HomePod]: "HomePod",
		[DeviceModel.HomePodMini]: "HomePod Mini",
		[DeviceModel.AirPortExpress]: "AirPort Express (gen 1)",
		[DeviceModel.AirPortExpressGen2]: "AirPort Express (gen 2)",
		[DeviceModel.AppleTV4KGen2]: "Apple TV 4K (gen 2)",
		[DeviceModel.Music]: "Music/iTunes",
		[DeviceModel.AppleTV4KGen3]: "Apple TV 4K (gen 3)",
		[DeviceModel.HomePodGen2]: "HomePod (gen 2)",
	};
	return map[deviceModel] ?? "Unknown";
}
