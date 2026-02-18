import { describe, expect, it } from "vitest";
import { MessageDispatcher } from "../../src/core/protocol.js";

describe("MessageDispatcher", () => {
	it("dispatches to async listener", async () => {
		let received: Buffer | null = null;

		async function dispatchFunc(message: Buffer): Promise<void> {
			received = message;
		}

		const dispatcher = new MessageDispatcher<number, Buffer>();
		dispatcher.listenTo(1, dispatchFunc);

		await Promise.all(dispatcher.dispatch(1, Buffer.from("123")));
		expect(received).toEqual(Buffer.from("123"));
	});

	it("dispatches to sync listener", async () => {
		let received: Buffer | null = null;

		function dispatchFunc(message: Buffer): void {
			received = message;
		}

		const dispatcher = new MessageDispatcher<number, Buffer>();
		dispatcher.listenTo(2, dispatchFunc);

		await Promise.all(dispatcher.dispatch(2, Buffer.from("456")));
		expect(received).toEqual(Buffer.from("456"));
	});

	it("dispatches to correct type", async () => {
		let count1 = 0;
		let count2 = 0;

		const dispatcher = new MessageDispatcher<number, string>();
		dispatcher.listenTo(1, async () => {
			count1++;
		});
		dispatcher.listenTo(2, async () => {
			count2++;
		});

		await Promise.all(dispatcher.dispatch(1, "test"));
		expect(count1).toBe(1);
		expect(count2).toBe(0);
	});

	it("dispatches with filter", async () => {
		let dispatchedValue: number | null = null;

		async function dispatchFunc(value: number): Promise<void> {
			dispatchedValue = value;
		}

		const dispatcher = new MessageDispatcher<number, number>();
		dispatcher.listenTo(1, dispatchFunc, (msg) => msg % 2 === 0);

		await Promise.all(dispatcher.dispatch(1, 1));
		expect(dispatchedValue).toBeNull();

		await Promise.all(dispatcher.dispatch(1, 2));
		expect(dispatchedValue).toBe(2);
	});

	it("handles multiple listeners", async () => {
		const results: string[] = [];

		const dispatcher = new MessageDispatcher<number, string>();
		dispatcher.listenTo(1, async (msg) => {
			results.push(`a:${msg}`);
		});
		dispatcher.listenTo(1, async (msg) => {
			results.push(`b:${msg}`);
		});

		await Promise.all(dispatcher.dispatch(1, "test"));
		expect(results).toContain("a:test");
		expect(results).toContain("b:test");
	});
});
