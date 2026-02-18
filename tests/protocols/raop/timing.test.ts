import { describe, expect, it } from "vitest";
import {
	ntp2ms,
	ntp2parts,
	ntp2ts,
	ntpNow,
	ts2ms,
	ts2ntp,
} from "../../../src/protocols/raop/timing.js";

describe("timing", () => {
	describe("ntpNow", () => {
		it("should return a bigint", () => {
			const now = ntpNow();
			expect(typeof now).toBe("bigint");
		});

		it("should return a positive value", () => {
			const now = ntpNow();
			expect(now > 0n).toBe(true);
		});

		it("should increase over time", () => {
			const t1 = ntpNow();
			// Small busy-wait
			const end = Date.now() + 5;
			while (Date.now() < end) {
				// busy wait
			}
			const t2 = ntpNow();
			expect(t2 > t1).toBe(true);
		});
	});

	describe("ntp2parts", () => {
		it("should split NTP time into seconds and fraction", () => {
			// Build a known NTP value: seconds=100, fraction=200
			const ntp = (BigInt(100) << 32n) | BigInt(200);
			const [sec, frac] = ntp2parts(ntp);
			expect(sec).toBe(100);
			expect(frac).toBe(200);
		});

		it("should handle zero", () => {
			const [sec, frac] = ntp2parts(0n);
			expect(sec).toBe(0);
			expect(frac).toBe(0);
		});
	});

	describe("ntp2ts", () => {
		it("should convert NTP time to timestamp", () => {
			const rate = 44100;
			const ntp = ntpNow();
			const ts = ntp2ts(ntp, rate);
			expect(typeof ts).toBe("number");
			expect(ts > 0).toBe(true);
		});
	});

	describe("ts2ntp", () => {
		it("should convert timestamp to NTP time", () => {
			const rate = 44100;
			const ts = 44100;
			const ntp = ts2ntp(ts, rate);
			expect(typeof ntp).toBe("bigint");
			expect(ntp > 0n).toBe(true);
		});
	});

	describe("ntp2ms", () => {
		it("should convert NTP time to milliseconds", () => {
			// Build an NTP value representing approximately 1 second
			const ntp = 1n << 32n;
			const ms = ntp2ms(ntp);
			// Should be approximately 1000ms
			expect(ms).toBeGreaterThan(900);
			expect(ms).toBeLessThan(1100);
		});

		it("should handle zero", () => {
			expect(ntp2ms(0n)).toBe(0);
		});
	});

	describe("ts2ms", () => {
		it("should convert timestamp to milliseconds", () => {
			const rate = 44100;
			// 44100 frames at 44100 Hz = 1 second = ~1000ms
			const ms = ts2ms(44100, rate);
			expect(ms).toBeGreaterThan(900);
			expect(ms).toBeLessThan(1100);
		});

		it("should return 0 for zero timestamp", () => {
			expect(ts2ms(0, 44100)).toBe(0);
		});
	});

	describe("roundtrip", () => {
		it("should approximately preserve value through ts->ntp->ts", () => {
			const rate = 44100;
			const originalTs = 100000;
			const ntp = ts2ntp(originalTs, rate);
			const recoveredTs = ntp2ts(ntp, rate);
			// Allow some rounding error due to integer division
			expect(Math.abs(recoveredTs - originalTs)).toBeLessThan(10);
		});
	});
});
