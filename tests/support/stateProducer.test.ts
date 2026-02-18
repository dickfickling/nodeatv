import { describe, expect, it, vi } from "vitest";
import { StateProducer } from "../../src/support/stateProducer.js";

interface TestListener {
	someMethod(value: number): void;
	anotherMethod(): void;
}

describe("StateProducer", () => {
	it("calls listener method when set", () => {
		const producer = new StateProducer<TestListener>();
		const listener: TestListener = {
			someMethod: vi.fn(),
			anotherMethod: vi.fn(),
		};

		producer.listener = listener;
		producer.listener.someMethod(42);

		expect(listener.someMethod).toHaveBeenCalledWith(42);
	});

	it("does nothing when no listener is set", () => {
		const producer = new StateProducer<TestListener>();
		// Should not throw
		producer.listener.someMethod(42);
	});

	it("does nothing for non-existent methods", () => {
		const producer = new StateProducer<TestListener>();
		const listener: TestListener = {
			someMethod: vi.fn(),
			anotherMethod: vi.fn(),
		};

		producer.listener = listener;
		// Calling a method that doesn't exist on listener
		(
			producer.listener as unknown as Record<
				string,
				(...args: unknown[]) => void
			>
		).nonExistentMethod();
		expect(listener.someMethod).not.toHaveBeenCalled();
	});

	it("removes listener when set to null", () => {
		const producer = new StateProducer<TestListener>();
		const listener: TestListener = {
			someMethod: vi.fn(),
			anotherMethod: vi.fn(),
		};

		producer.listener = listener;
		producer.listener = null;
		producer.listener.someMethod(42);

		expect(listener.someMethod).not.toHaveBeenCalled();
	});

	it("respects max calls limit", () => {
		const producer = new StateProducer<TestListener>(2);
		const listener: TestListener = {
			someMethod: vi.fn(),
			anotherMethod: vi.fn(),
		};

		producer.listener = listener;
		producer.listener.someMethod(1); // call 1
		producer.listener.someMethod(2); // call 2
		producer.listener.someMethod(3); // call 3 - exceeds limit

		expect(listener.someMethod).toHaveBeenCalledTimes(2);
	});

	it("calls stateWasUpdated on listener method call", () => {
		const producer = new StateProducer<TestListener>();
		const stateUpdatedSpy = vi.spyOn(producer, "stateWasUpdated");
		const listener: TestListener = {
			someMethod: vi.fn(),
			anotherMethod: vi.fn(),
		};

		producer.listener = listener;
		producer.listener.someMethod(42);

		expect(stateUpdatedSpy).toHaveBeenCalled();
	});

	it("calls stateWasUpdated even without listener", () => {
		const producer = new StateProducer<TestListener>();
		const stateUpdatedSpy = vi.spyOn(producer, "stateWasUpdated");

		producer.listener.someMethod(42);

		expect(stateUpdatedSpy).toHaveBeenCalled();
	});

	it("tracks calls made count", () => {
		const producer = new StateProducer<TestListener>();
		const listener: TestListener = {
			someMethod: vi.fn(),
			anotherMethod: vi.fn(),
		};

		producer.listener = listener;
		expect(producer.callsMade).toBe(0);

		producer.listener.someMethod(1);
		expect(producer.callsMade).toBe(1);

		producer.listener.anotherMethod();
		expect(producer.callsMade).toBe(2);
	});
});
