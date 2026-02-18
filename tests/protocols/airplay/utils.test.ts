import { describe, expect, it } from "vitest";
import {
	HapCredentials,
	TRANSIENT_CREDENTIALS,
} from "../../../src/auth/hapPairing.js";
import { PairingRequirement, Protocol } from "../../../src/const.js";
import { MutableService } from "../../../src/core/core.js";
import {
	AirPlayFlags,
	AirPlayMajorVersion,
	dbfsToPct,
	getPairingRequirement,
	getProtocolVersion,
	hasFlag,
	isPasswordRequired,
	isRemoteControlSupported,
	parseFeatures,
	pctToDbfs,
	updateServiceDetails,
} from "../../../src/protocols/airplay/utils.js";

// Helper to create a mock service
function mockService(properties: Record<string, string> = {}): MutableService {
	return new MutableService(null, Protocol.AirPlay, 7000, properties);
}

describe("parseFeatures", () => {
	it("parses single hex value", () => {
		const flags = parseFeatures("0x1");
		expect(flags).toBe(1n);
	});

	it("parses two-part hex value", () => {
		const flags = parseFeatures("0x00000001,0x00000001");
		// 0x0000000100000001
		expect(flags).toBe(0x100000001n);
	});

	it("parses complex feature string", () => {
		const flags = parseFeatures("0x5A7FFFF7,0x1E");
		expect(hasFlag(flags, AirPlayFlags.SupportsAirPlayVideoV1)).toBe(true);
		expect(hasFlag(flags, AirPlayFlags.SupportsAirPlayAudio)).toBe(true);
	});

	it("throws on invalid feature string", () => {
		expect(() => parseFeatures("invalid")).toThrow("invalid feature string");
		expect(() => parseFeatures("0x")).toThrow("invalid feature string");
	});

	it("parses features with lowercase hex", () => {
		const flags = parseFeatures("0x0a0b0c0d");
		expect(flags).toBe(0x0a0b0c0dn);
	});

	it("detects specific flags", () => {
		const flags = parseFeatures("0x00000000,0x00010000");
		expect(
			hasFlag(flags, AirPlayFlags.SupportsCoreUtilsPairingAndEncryption),
		).toBe(true);
	});
});

describe("hasFlag", () => {
	it("returns true when flag is present", () => {
		expect(hasFlag(0x201n, 0x200n)).toBe(true);
	});

	it("returns false when flag is absent", () => {
		expect(hasFlag(0x001n, 0x200n)).toBe(false);
	});
});

describe("isPasswordRequired", () => {
	it("returns true when pw is true", () => {
		const service = mockService({ pw: "true" });
		expect(isPasswordRequired(service)).toBe(true);
	});

	it("returns false when pw is false", () => {
		const service = mockService({ pw: "false" });
		expect(isPasswordRequired(service)).toBe(false);
	});

	it("returns true when password bit is set in flags", () => {
		const service = mockService({ flags: "0x80" });
		expect(isPasswordRequired(service)).toBe(true);
	});

	it("returns false for no password indicators", () => {
		const service = mockService({});
		expect(isPasswordRequired(service)).toBe(false);
	});
});

describe("getPairingRequirement", () => {
	it("returns Mandatory when legacy pairing bit set", () => {
		const service = mockService({ sf: "0x200" });
		expect(getPairingRequirement(service)).toBe(PairingRequirement.Mandatory);
	});

	it("returns Mandatory when PIN required bit set", () => {
		const service = mockService({ flags: "0x8" });
		expect(getPairingRequirement(service)).toBe(PairingRequirement.Mandatory);
	});

	it("returns Unsupported when act is 2", () => {
		const service = mockService({ act: "2" });
		expect(getPairingRequirement(service)).toBe(PairingRequirement.Unsupported);
	});

	it("returns NotNeeded by default", () => {
		const service = mockService({});
		expect(getPairingRequirement(service)).toBe(PairingRequirement.NotNeeded);
	});
});

describe("isRemoteControlSupported", () => {
	it("returns true for HomePod with transient credentials", () => {
		const service = mockService({ model: "AudioAccessory1,1" });
		expect(isRemoteControlSupported(service, TRANSIENT_CREDENTIALS)).toBe(true);
	});

	it("returns false for HomePod with non-transient credentials", () => {
		const service = mockService({ model: "AudioAccessory1,1" });
		const creds = new HapCredentials(
			Buffer.from("a".repeat(64), "hex"),
			Buffer.from("b".repeat(64), "hex"),
			Buffer.from("c".repeat(64), "hex"),
			Buffer.from("d".repeat(64), "hex"),
		);
		expect(isRemoteControlSupported(service, creds)).toBe(false);
	});

	it("returns true for AppleTV with tvOS 13+ and HAP credentials", () => {
		const service = mockService({
			model: "AppleTV6,2",
			osvers: "14.0",
		});
		const creds = new HapCredentials(
			Buffer.from("a".repeat(64), "hex"),
			Buffer.from("b".repeat(64), "hex"),
			Buffer.from("c".repeat(64), "hex"),
			Buffer.from("d".repeat(64), "hex"),
		);
		expect(isRemoteControlSupported(service, creds)).toBe(true);
	});

	it("returns false for AppleTV with tvOS < 13", () => {
		const service = mockService({
			model: "AppleTV3,1",
			osvers: "12.0",
		});
		const creds = new HapCredentials(
			Buffer.from("a".repeat(64), "hex"),
			Buffer.from("b".repeat(64), "hex"),
			Buffer.from("c".repeat(64), "hex"),
			Buffer.from("d".repeat(64), "hex"),
		);
		expect(isRemoteControlSupported(service, creds)).toBe(false);
	});

	it("returns false for non-Apple device", () => {
		const service = mockService({ model: "SomeOtherDevice" });
		expect(isRemoteControlSupported(service, TRANSIENT_CREDENTIALS)).toBe(
			false,
		);
	});
});

describe("getProtocolVersion", () => {
	it("detects AirPlayV2 from features with unified media control", () => {
		// Bit 38 = SupportsUnifiedMediaControl
		const service = mockService({ features: "0x00000000,0x00000040" });
		expect(getProtocolVersion(service, "auto" as never)).toBe(
			AirPlayMajorVersion.AirPlayV2,
		);
	});

	it("returns AirPlayV1 when no V2 flags", () => {
		const service = mockService({ features: "0x00000001" });
		expect(getProtocolVersion(service, "auto" as never)).toBe(
			AirPlayMajorVersion.AirPlayV1,
		);
	});

	it("returns AirPlayV2 when forced", () => {
		const service = mockService({ features: "0x00000001" });
		expect(getProtocolVersion(service, "2" as never)).toBe(
			AirPlayMajorVersion.AirPlayV2,
		);
	});

	it("returns AirPlayV1 when forced to V1", () => {
		const service = mockService({ features: "0x00000000,0x00000040" });
		expect(getProtocolVersion(service, "1" as never)).toBe(
			AirPlayMajorVersion.AirPlayV1,
		);
	});

	it("uses ft property as fallback", () => {
		const service = mockService({ ft: "0x00000000,0x00000040" });
		expect(getProtocolVersion(service, "auto" as never)).toBe(
			AirPlayMajorVersion.AirPlayV2,
		);
	});
});

describe("updateServiceDetails", () => {
	it("sets requiresPassword from pw property", () => {
		const service = mockService({ pw: "true" });
		updateServiceDetails(service);
		expect(service.requiresPassword).toBe(true);
	});

	it("sets pairing to disabled when acl is 1", () => {
		const service = mockService({ acl: "1" });
		updateServiceDetails(service);
		expect(service.pairing).toBe(PairingRequirement.Disabled);
	});

	it("sets pairing to unsupported for Mac models", () => {
		const service = mockService({ model: "Mac14,3" });
		updateServiceDetails(service);
		expect(service.pairing).toBe(PairingRequirement.Unsupported);
	});

	it("sets pairing from flags when no ACL or model override", () => {
		const service = mockService({ flags: "0x200" });
		updateServiceDetails(service);
		expect(service.pairing).toBe(PairingRequirement.Mandatory);
	});
});

describe("pctToDbfs", () => {
	it("converts 0% to -144.0 (muted)", () => {
		expect(pctToDbfs(0.0)).toBe(-144.0);
	});

	it("converts 100% to 0.0 dBFS", () => {
		expect(pctToDbfs(100.0)).toBeCloseTo(0.0, 5);
	});

	it("converts 50% to -15.0 dBFS", () => {
		expect(pctToDbfs(50.0)).toBeCloseTo(-15.0, 5);
	});
});

describe("dbfsToPct", () => {
	it("converts -144.0 to 0%", () => {
		expect(dbfsToPct(-144.0)).toBe(0.0);
	});

	it("converts 0.0 dBFS to 100%", () => {
		expect(dbfsToPct(0.0)).toBeCloseTo(100.0, 5);
	});

	it("converts -15.0 dBFS to 50%", () => {
		expect(dbfsToPct(-15.0)).toBeCloseTo(50.0, 5);
	});

	it("treats values below -30 as muted", () => {
		expect(dbfsToPct(-31.0)).toBe(0.0);
		expect(dbfsToPct(-50.0)).toBe(0.0);
	});
});
