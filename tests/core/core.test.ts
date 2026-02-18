import { describe, expect, it, vi } from "vitest";
import { Protocol } from "../../src/const.js";
import {
	AbstractPushUpdater,
	type CoreStateDispatcher,
	ProtocolStateDispatcher,
	type StateMessage,
	UpdatedState,
} from "../../src/core/core.js";
import { MessageDispatcher } from "../../src/core/protocol.js";
import { Playing } from "../../src/interface.js";

class PushUpdaterDummy extends AbstractPushUpdater {
	get active(): boolean {
		throw new Error("not supported");
	}

	start(_initialDelay?: number): void {
		throw new Error("not supported");
	}

	stop(): void {
		throw new Error("not supported");
	}
}

describe("Core", () => {
	function createStateDispatcher(): ProtocolStateDispatcher {
		const coreDispatcher: CoreStateDispatcher = new MessageDispatcher<
			UpdatedState,
			StateMessage
		>();
		return new ProtocolStateDispatcher(Protocol.MRP, coreDispatcher);
	}

	it.each([
		1, 2, 3,
	])("post_update ignores duplicate (%i updates)", async (updates) => {
		const stateDispatcher = createStateDispatcher();
		const stateUpdated = vi.fn();
		const playstatusUpdate = vi.fn();
		const playing = new Playing();

		stateDispatcher.listenTo(UpdatedState.Playing, (message: StateMessage) => {
			expect(message.protocol).toBe(Protocol.MRP);
			expect(message.state).toBe(UpdatedState.Playing);
			stateUpdated(message.value);
		});

		const updater = new PushUpdaterDummy(stateDispatcher);
		updater.listener = {
			playstatusUpdate: playstatusUpdate,
			playstatusError: () => {},
		};

		for (let i = 0; i < updates; i++) {
			updater.postUpdate(playing);
		}

		// Wait for microtasks to flush
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(stateUpdated).toHaveBeenCalledTimes(1);
		expect(stateUpdated).toHaveBeenCalledWith(playing);
		expect(playstatusUpdate).toHaveBeenCalledTimes(1);
		expect(playstatusUpdate).toHaveBeenCalledWith(expect.anything(), playing);
	});
});
