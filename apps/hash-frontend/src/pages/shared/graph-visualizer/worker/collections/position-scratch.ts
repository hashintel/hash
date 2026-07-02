/**
 * Dense index to (x, y) scratch map: two Float64Arrays, one per coordinate
 * plane.
 *
 * Replaces `Map<index, [x, y]>` in seeding passes that run per layout
 * (re)build: flat buffers instead of a Map plus one tuple allocation per
 * entry, and `reset` reuses the buffers across passes. Separate x/y planes
 * rather than one interleaved buffer: measured faster for both random access
 * and sequential sweeps, and half the slots to clear when only presence (x)
 * must be invalidated.
 *
 * A NaN x-coordinate marks an empty slot (a legitimate position is never
 * NaN), so presence needs no separate bit set -- and clearing touches only
 * the x plane.
 */
export class PositionScratch<Index extends number> {
  #xs = new Float64Array(0);
  #ys = new Float64Array(0);

  /** Slots in use: the capacity passed to the last {@link reset}. */
  #length = 0;

  /** Empty every slot and ensure room for indices below `capacity`. */
  reset(capacity: number): void {
    if (this.#xs.length < capacity) {
      this.#xs = new Float64Array(capacity);
      this.#ys = new Float64Array(capacity);
    }
    this.#length = capacity;
    // Only x carries the empty marker; y is always written alongside it.
    this.#xs.fill(Number.NaN, 0, capacity);
  }

  has(index: Index): boolean {
    return index < this.#length && !Number.isNaN(this.#xs[index]!);
  }

  /** The x coordinate of a slot {@link set} earlier; NaN when empty. */
  x(index: Index): number {
    return this.#xs[index]!;
  }

  /** The y coordinate of a slot {@link set} earlier; meaningful only when {@link has}. */
  y(index: Index): number {
    return this.#ys[index]!;
  }

  set(index: Index, x: number, y: number): void {
    this.#xs[index] = x;
    this.#ys[index] = y;
  }
}
