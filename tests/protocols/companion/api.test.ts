import { describe, expect, it } from "vitest";
import {
	HidCommand,
	MediaControlCommand,
	SystemStatus,
} from "../../../src/protocols/companion/api.js";

describe("HidCommand", () => {
	it("has expected enum values", () => {
		expect(HidCommand.Up).toBe(1);
		expect(HidCommand.Down).toBe(2);
		expect(HidCommand.Left).toBe(3);
		expect(HidCommand.Right).toBe(4);
		expect(HidCommand.Menu).toBe(5);
		expect(HidCommand.Select).toBe(6);
		expect(HidCommand.Home).toBe(7);
		expect(HidCommand.VolumeUp).toBe(8);
		expect(HidCommand.VolumeDown).toBe(9);
		expect(HidCommand.Siri).toBe(10);
		expect(HidCommand.Screensaver).toBe(11);
		expect(HidCommand.Sleep).toBe(12);
		expect(HidCommand.Wake).toBe(13);
		expect(HidCommand.PlayPause).toBe(14);
		expect(HidCommand.ChannelIncrement).toBe(15);
		expect(HidCommand.ChannelDecrement).toBe(16);
		expect(HidCommand.Guide).toBe(17);
		expect(HidCommand.PageUp).toBe(18);
		expect(HidCommand.PageDown).toBe(19);
	});

	it("has all 19 commands", () => {
		const values = Object.values(HidCommand).filter(
			(v) => typeof v === "number",
		);
		expect(values).toHaveLength(19);
	});
});

describe("MediaControlCommand", () => {
	it("has expected enum values", () => {
		expect(MediaControlCommand.Play).toBe(1);
		expect(MediaControlCommand.Pause).toBe(2);
		expect(MediaControlCommand.NextTrack).toBe(3);
		expect(MediaControlCommand.PreviousTrack).toBe(4);
		expect(MediaControlCommand.GetVolume).toBe(5);
		expect(MediaControlCommand.SetVolume).toBe(6);
		expect(MediaControlCommand.SkipBy).toBe(7);
		expect(MediaControlCommand.FastForwardBegin).toBe(8);
		expect(MediaControlCommand.FastForwardEnd).toBe(9);
		expect(MediaControlCommand.RewindBegin).toBe(10);
		expect(MediaControlCommand.RewindEnd).toBe(11);
		expect(MediaControlCommand.GetCaptionSettings).toBe(12);
		expect(MediaControlCommand.SetCaptionSettings).toBe(13);
	});

	it("has all 13 commands", () => {
		const values = Object.values(MediaControlCommand).filter(
			(v) => typeof v === "number",
		);
		expect(values).toHaveLength(13);
	});
});

describe("SystemStatus", () => {
	it("has expected enum values", () => {
		expect(SystemStatus.Unknown).toBe(0x00);
		expect(SystemStatus.Asleep).toBe(0x01);
		expect(SystemStatus.Screensaver).toBe(0x02);
		expect(SystemStatus.Awake).toBe(0x03);
		expect(SystemStatus.Idle).toBe(0x04);
	});
});
