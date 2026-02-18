export const NO_MAX_CALLS = 0;

class ListenerProxy<T extends object> {
	private producerRef: WeakRef<StateProducer<T>>;
	private listenerRef: WeakRef<T> | null;

	constructor(producer: StateProducer<T>, listener: WeakRef<T> | null) {
		this.producerRef = new WeakRef(producer);
		this.listenerRef = listener;
	}

	getProxy(): T {
		return new Proxy({} as T, {
			get: (_target, prop: string) => {
				const producer = this.producerRef.deref();

				if (producer) {
					producer.callsMade += 1;
					if (producer.maxCalls && producer.callsMade > producer.maxCalls) {
						return () => {};
					}
				}

				if (this.listenerRef !== null) {
					const listener = this.listenerRef.deref();
					if (listener && prop in listener) {
						producer?.stateWasUpdated();
						return (listener as Record<string, unknown>)[prop];
					}
				} else {
					producer?.stateWasUpdated();
				}

				return () => {};
			},
		});
	}
}

export class StateProducer<T extends object> {
	private _listenerRef: WeakRef<T> | null = null;
	maxCalls: number;
	callsMade = 0;

	constructor(maxCalls: number = NO_MAX_CALLS) {
		this.maxCalls = maxCalls;
	}

	get listener(): T {
		return new ListenerProxy<T>(this, this._listenerRef).getProxy();
	}

	set listener(target: T | null) {
		this._listenerRef = target !== null ? new WeakRef(target) : null;
	}

	stateWasUpdated(): void {}
}
