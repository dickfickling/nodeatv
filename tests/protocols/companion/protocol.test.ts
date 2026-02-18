import { describe, expect, it } from "vitest";
import { FrameType } from "../../../src/protocols/companion/connection.js";
import {
	CompanionProtocol,
	MessageType,
} from "../../../src/protocols/companion/protocol.js";

describe("MessageType", () => {
	it("has expected enum values", () => {
		expect(MessageType.Event).toBe(1);
		expect(MessageType.Request).toBe(2);
		expect(MessageType.Response).toBe(3);
	});
});

describe("CompanionProtocol", () => {
	function makeMockConnection() {
		let listener: {
			frameReceived(frameType: number, data: Buffer): void;
		} | null = null;
		return {
			setListener(l: {
				frameReceived(frameType: number, data: Buffer): void;
			}): void {
				listener = l;
			},
			getListener() {
				return listener;
			},
			send(_frameType: number, _data: Buffer): void {},
			connect: async () => {},
			close(): void {},
		};
	}

	function makeMockService() {
		return {
			credentials: null,
			port: 49152,
			protocol: 4,
			properties: {},
		};
	}

	function makeMockSrp() {
		return {
			pairingId: Buffer.from("test-id"),
		};
	}

	it("initializes with random XID", () => {
		const conn = makeMockConnection();
		const proto = new CompanionProtocol(
			conn as never,
			makeMockSrp() as never,
			makeMockService() as never,
		);
		expect(proto).toBeDefined();
	});

	it("sets listener on connection", () => {
		const conn = makeMockConnection();
		const _proto = new CompanionProtocol(
			conn as never,
			makeMockSrp() as never,
			makeMockService() as never,
		);
		expect(conn.getListener()).toBeDefined();
	});

	it("listener property can be set and retrieved", () => {
		const conn = makeMockConnection();
		const proto = new CompanionProtocol(
			conn as never,
			makeMockSrp() as never,
			makeMockService() as never,
		);

		expect(proto.listener).toBeNull();

		const mockListener = {
			eventReceived(_name: string, _data: Record<string, unknown>) {},
		};
		proto.listener = mockListener;
		expect(proto.listener).toBe(mockListener);
	});

	it("sendOpack assigns _x and increments XID", () => {
		const conn = makeMockConnection();
		const sentFrames: Array<{ frameType: number; data: Buffer }> = [];
		conn.send = (frameType: number, data: Buffer) => {
			sentFrames.push({ frameType, data });
		};

		const proto = new CompanionProtocol(
			conn as never,
			makeMockSrp() as never,
			makeMockService() as never,
		);

		// Call sendOpack twice to verify XID increments
		const data1: Record<string, unknown> = { test: "first" };
		proto.sendOpack(FrameType.E_OPACK, data1);
		const xid1 = data1._x as number;
		expect(typeof xid1).toBe("number");

		const data2: Record<string, unknown> = { test: "second" };
		proto.sendOpack(FrameType.E_OPACK, data2);
		const xid2 = data2._x as number;
		expect(xid2).toBe(xid1 + 1);

		expect(sentFrames).toHaveLength(2);
	});

	it("sendOpack does not override existing _x", () => {
		const conn = makeMockConnection();
		conn.send = () => {};

		const proto = new CompanionProtocol(
			conn as never,
			makeMockSrp() as never,
			makeMockService() as never,
		);

		const data: Record<string, unknown> = { _x: 999 };
		proto.sendOpack(FrameType.E_OPACK, data);
		expect(data._x).toBe(999);
	});
});
