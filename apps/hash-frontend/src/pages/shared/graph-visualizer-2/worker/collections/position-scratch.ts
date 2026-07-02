/**
 * Dense index -> (x, y) scratch map backed by a single Float64Array.
 *
 * Replaces `Map<index, [x, y]>` in seeding passes that run per layout
 * (re)build: one flat buffer instead of a Map plus one tuple allocation per
 * entry, and `reset` reuses the buffer across passes.
 *
 * A NaN x-coordinate marks an empty slot (a legitimate position is never
 * NaN), so presence needs no separate bit set.
 */
export class PositionScratch<Index extends number> {
  #coords = new Float64Array(0);

  /** Entries in use: 2 * the capacity passed to the last {@link reset}. */
  #length = 0;

  /** Empty every slot and ensure room for indices below `capacity`. */
  reset(capacity: number): void {
    const required = capacity * 2;
    if (this.#coords.length < required) {
      this.#coords = new Float64Array(required);
    }
    this.#length = required;
    this.#coords.fill(Number.NaN, 0, required);
  }

  has(index: Index): boolean {
    const slot = index * 2;
    return slot < this.#length && !Number.isNaN(this.#coords[slot]!);
  }

  /** The x coordinate of a slot {@link set} earlier; NaN when empty. */
  x(index: Index): number {
    return this.#coords[index * 2]!;
  }

  /** The y coordinate of a slot {@link set} earlier; NaN when empty. */
  y(index: Index): number {
    return this.#coords[index * 2 + 1]!;
  }

  set(index: Index, x: number, y: number): void {
    const slot = index * 2;
    this.#coords[slot] = x;
    this.#coords[slot + 1] = y;
  }
}
