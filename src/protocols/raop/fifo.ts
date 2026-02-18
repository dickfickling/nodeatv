/**
 * Simple FIFO for packets based on Map.
 *
 * This FIFO holds a certain number of elements as defined by upperLimit. Each item maps a
 * sequence number to a packet, allowing fast look up of a certain packet. The order is
 * defined by insertion order and *not* sequence number order.
 *
 * When upper limit is exceeded, the item that was *inserted* first is removed.
 */

export class PacketFifo<T> {
	private _items: Map<number, T> = new Map();
	private _upperLimit: number;

	constructor(upperLimit: number) {
		this._upperLimit = upperLimit;
	}

	/** Remove all items in FIFO. */
	clear(): void {
		this._items.clear();
	}

	/** Return number of items in FIFO. */
	get size(): number {
		return this._items.size;
	}

	/** Add an item to FIFO. */
	set(index: number, value: T): void {
		if (!Number.isInteger(index)) {
			throw new TypeError("only integer supported as key");
		}

		// Cannot add item with same index again
		if (this._items.has(index)) {
			throw new Error(`${index} already in FIFO`);
		}

		// Remove oldest item if limit is exceeded
		if (this._items.size + 1 > this._upperLimit) {
			const firstKey = this._items.keys().next().value;
			if (firstKey !== undefined) {
				this._items.delete(firstKey);
			}
		}

		this._items.set(index, value);
	}

	/** Return value of an item. */
	get(index: number): T | undefined {
		if (!Number.isInteger(index)) {
			throw new TypeError("only integer supported as key");
		}
		return this._items.get(index);
	}

	/** Return if an element exists in FIFO. */
	has(index: number): boolean {
		return this._items.has(index);
	}

	/** Iterate over indices in FIFO. */
	keys(): IterableIterator<number> {
		return this._items.keys();
	}

	/** Return string representation of FIFO (only index numbers). */
	toString(): string {
		return JSON.stringify([...this._items.keys()]);
	}
}
