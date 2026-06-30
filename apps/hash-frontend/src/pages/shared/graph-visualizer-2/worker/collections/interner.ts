/**
 * Bidirectional string interner.
 *
 * Assigns a stable integer index to each unique string value.
 * Used for entity IDs, type-set keys, and versioned URLs to avoid
 * storing millions of repeated string references.
 */
export class Interner<In, Out extends number> {
  readonly #map: Map<In, Out>;
  readonly #values: In[];

  constructor() {
    this.#map = new Map<In, Out>();
    this.#values = [];
  }

  tryIntern(value: In): [boolean, Out] {
    const existing = this.#map.get(value);
    if (existing !== undefined) {
      return [false, existing];
    }

    const index = this.#values.length as Out;
    this.#values.push(value);
    this.#map.set(value, index);

    return [true, index];
  }

  /** Get or create an index for the given value. */
  intern(value: In): Out {
    const [, index] = this.tryIntern(value);
    return index;
  }

  /** Get the index for a value, or undefined if not interned. */
  tryGet(value: In): Out | undefined {
    return this.#map.get(value);
  }

  /** Get the value for an index. */
  getValue(idx: Out): In {
    const value = this.#values[idx];

    if (value === undefined) {
      throw new Error(`Interner: no value at index ${idx}`);
    }

    return value;
  }

  get size(): number {
    return this.#values.length;
  }
}
