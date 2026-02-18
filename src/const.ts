export const MAJOR_VERSION = "0";
export const MINOR_VERSION = "1";
export const PATCH_VERSION = "0";
export const __short_version__ = `${MAJOR_VERSION}.${MINOR_VERSION}`;
export const __version__ = `${__short_version__}.${PATCH_VERSION}`;

export enum Protocol {
	DMAP = 1,
	MRP = 2,
	AirPlay = 3,
	Companion = 4,
	RAOP = 5,
}

export enum MediaType {
	Unknown = 0,
	Video = 1,
	Music = 2,
	TV = 3,
}

export enum DeviceState {
	Idle = 0,
	Loading = 1,
	Paused = 2,
	Playing = 3,
	Stopped = 4,
	Seeking = 5,
}

export enum RepeatState {
	Off = 0,
	Track = 1,
	All = 2,
}

export enum ShuffleState {
	Off = 0,
	Albums = 1,
	Songs = 2,
}

export enum PowerState {
	Unknown = 0,
	Off = 1,
	On = 2,
}

export enum KeyboardFocusState {
	Unknown = 0,
	Unfocused = 1,
	Focused = 2,
}

export enum OperatingSystem {
	Unknown = 0,
	Legacy = 1,
	TvOS = 2,
	AirPortOS = 3,
	MacOS = 4,
}

export enum DeviceModel {
	Unknown = 0,
	Gen2 = 1,
	Gen3 = 2,
	Gen4 = 3,
	Gen4K = 4,
	HomePod = 5,
	HomePodMini = 6,
	AirPortExpress = 7,
	AirPortExpressGen2 = 8,
	AppleTV4KGen2 = 9,
	Music = 10,
	AppleTV4KGen3 = 11,
	HomePodGen2 = 12,
	AppleTVGen1 = 13,
}

export enum InputAction {
	SingleTap = 0,
	DoubleTap = 1,
	Hold = 2,
}

export enum PairingRequirement {
	Unsupported = 1,
	Disabled = 2,
	NotNeeded = 3,
	Optional = 4,
	Mandatory = 5,
}

export enum FeatureState {
	Unknown = 0,
	Unsupported = 1,
	Unavailable = 2,
	Available = 3,
}

export enum FeatureName {
	Up = 0,
	Down = 1,
	Left = 2,
	Right = 3,
	Play = 4,
	PlayPause = 5,
	Pause = 6,
	Stop = 7,
	Next = 8,
	Previous = 9,
	Select = 10,
	Menu = 11,
	VolumeUp = 12,
	VolumeDown = 13,
	Home = 14,
	HomeHold = 15,
	TopMenu = 16,
	Suspend = 17,
	WakeUp = 18,
	SetPosition = 19,
	SetShuffle = 20,
	SetRepeat = 21,
	Title = 22,
	Artist = 23,
	Album = 24,
	Genre = 25,
	TotalTime = 26,
	Position = 27,
	Shuffle = 28,
	Repeat = 29,
	Artwork = 30,
	PlayUrl = 31,
	PowerState = 32,
	TurnOn = 33,
	TurnOff = 34,
	App = 35,
	SkipForward = 36,
	SkipBackward = 37,
	AppList = 38,
	LaunchApp = 39,
	SeriesName = 40,
	SeasonNumber = 41,
	EpisodeNumber = 42,
	PushUpdates = 43,
	StreamFile = 44,
	Volume = 45,
	SetVolume = 46,
	ContentIdentifier = 47,
	ChannelUp = 48,
	ChannelDown = 49,
	iTunesStoreIdentifier = 50,
	TextGet = 51,
	TextClear = 52,
	TextAppend = 53,
	TextSet = 54,
	AccountList = 55,
	SwitchAccount = 56,
	TextFocusState = 57,
	Screensaver = 58,
	OutputDevices = 59,
	AddOutputDevices = 60,
	RemoveOutputDevices = 61,
	SetOutputDevices = 62,
	Swipe = 63,
	Action = 64,
	Click = 65,
	Guide = 66,
	ControlCenter = 68,
}

export enum TouchAction {
	Press = 1,
	Hold = 3,
	Release = 4,
	Click = 5,
}
