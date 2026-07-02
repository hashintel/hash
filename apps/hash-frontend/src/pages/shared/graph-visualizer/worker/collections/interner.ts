/**
 * Bidirectional interner: assigns a stable integer index to each
 * unique value, and supports reverse lookup by index.
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

    // Indices are assigned sequentially from 0; Out is a branded number type.
    const index = this.#values.length as Out;
    this.#values.push(value);
    this.#map.set(value, index);

    return [true, index];
  }

  /** Returns the stable index for value, assigning the next monotonic index on first sight. */
  intern(value: In): Out {
    const [, index] = this.tryIntern(value);
    return index;
  }

  /** Looks up a previously interned value's index without inserting. */
  tryGet(value: In): Out | undefined {
    return this.#map.get(value);
  }

  /**
   * Reverse lookup by index.
   *
   * @throws {Error} When idx is out of range or was never assigned.
   */
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
