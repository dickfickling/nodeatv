export const HEARTBEAT_INTERVAL = 30;
export const HEARTBEAT_RETRIES = 1;

type DispatchFunc<M> = ((message: M) => void) | ((message: M) => Promise<void>);
type DispatchFilterFunc<M> = (message: M) => boolean;

function noFilter<M>(_message: M): boolean {
	return true;
}

// biome-ignore lint/complexity/noBannedTypes: need generic callable check
function isAsyncFunction(fn: Function): boolean {
	return fn.constructor.name === "AsyncFunction";
}

export async function heartbeater<M>(
	_name: string,
	senderFunc: (message: M | null) => Promise<void>,
	finishFunc: () => void = () => {},
	failureFunc: (exc: Error) => void = () => {},
	messageFactory: () => M | null = () => null,
	retries = HEARTBEAT_RETRIES,
	interval = HEARTBEAT_INTERVAL,
): Promise<void> {
	let attempts = 0;
	const message = messageFactory();

	while (true) {
		try {
			if (attempts === 0) {
				await sleep(interval * 1000);
			}

			await senderFunc(message);
		} catch (ex) {
			if (ex instanceof CancelledError) break;
			attempts++;
			if (attempts > retries) {
				failureFunc(ex as Error);
				return;
			}
			continue;
		}
		attempts = 0;
	}

	finishFunc();
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CancelledError extends Error {
	constructor() {
		super("cancelled");
		this.name = "CancelledError";
	}
}

export class MessageDispatcher<DT, DM> {
	private _listeners: Map<
		DT,
		Array<[DispatchFilterFunc<DM>, DispatchFunc<DM>]>
	> = new Map();

	listenTo(
		dispatchType: DT,
		func: DispatchFunc<DM>,
		messageFilter: DispatchFilterFunc<DM> = noFilter,
	): void {
		if (!this._listeners.has(dispatchType)) {
			this._listeners.set(dispatchType, []);
		}
		this._listeners.get(dispatchType)?.push([messageFilter, func]);
	}

	dispatch(dispatchType: DT, message: DM): Promise<void>[] {
		const tasks: Promise<void>[] = [];
		const listeners = this._listeners.get(dispatchType) ?? [];

		for (const [filterFunc, func] of listeners) {
			if (!filterFunc(message)) continue;

			if (isAsyncFunction(func)) {
				tasks.push(
					(async () => {
						try {
							await (func as (m: DM) => Promise<void>)(message);
						} catch {
							// Silently catch dispatch errors
						}
					})(),
				);
			} else {
				// Sync function — wrap in a resolved promise for consistency
				tasks.push(
					Promise.resolve().then(() => {
						(func as (m: DM) => void)(message);
					}),
				);
			}
		}

		return tasks;
	}
}
