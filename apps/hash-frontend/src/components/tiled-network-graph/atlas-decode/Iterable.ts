/**
 * Lazy combinators over synchronous iterables.
 *
 * Every function returns a re-iterable {@link Iterable}: each `for...of` opens fresh iterators on the sources, and nothing is consumed until iteration begins.
 *
 * @module
 */

import { dual } from "./Function";

/** The positional element tuple produced by {@link zip}. */
export type Zipped<Sources extends readonly Iterable<unknown>[]> = {
  -readonly [Index in keyof Sources]: Sources[Index] extends Iterable<
    infer Element
  >
    ? Element
    : never;
};

/**
 * Transforms each element on demand, passing its position within the current iteration.
 *
 * @example
 * ```ts
 * const lengths = Iterable.map(words, (word) => word.length);
 * const doubled = Iterable.map((value: number) => value * 2)(numbers);
 * ```
 */
export const map: {
  <T, U>(
    transform: (element: T, index: number) => U,
  ): (source: Iterable<T>) => Iterable<U>;
  <T, U>(
    source: Iterable<T>,
    transform: (element: T, index: number) => U,
  ): Iterable<U>;
} = dual(
  2,
  <T, U>(
    source: Iterable<T>,
    transform: (element: T, index: number) => U,
  ): Iterable<U> => ({
    *[Symbol.iterator](): Generator<U, void, unknown> {
      let index = 0;
      for (const element of source) {
        yield transform(element, index);
        index += 1;
      }
    },
  }),
);

/**
 * Drains the source into a new array. Never returns for an infinite source.
 *
 * Called without arguments, returns the collector itself for use as a pipeline step.
 */
export const collect: {
  <T>(): (source: Iterable<T>) => T[];
  <T>(source: Iterable<T>): T[];
} = dual(1, <T>(source: Iterable<T>): T[] => Array.from(source));

/**
 * Yields the same value indefinitely, or `count` times when supplied.
 *
 * Pairs with {@link zip} to attach a constant to every element of a finite source, since zip ends with its shortest source.
 *
 * @example
 * ```ts
 * for (const [id, generation] of Iterable.zip(ids, Iterable.repeat(generation))) {
 *   // every id is paired with the same generation
 * }
 * ```
 */
export const repeat = <T>(value: T, count = Infinity): Iterable<T> => ({
  *[Symbol.iterator](): Generator<T, void, unknown> {
    for (let index = 0; index < count; index += 1) {
      yield value;
    }
  },
});

/**
 * Pairs elements by position, ending with the shortest source.
 *
 * Once any source is exhausted, or the consumer stops early, every remaining iterator is closed with `return` so generators run their cleanup. Zipping no sources yields nothing.
 *
 * @example
 * ```ts
 * for (const [id, position] of Iterable.zip(ids, positions)) {
 *   // id: NodeId, position: Position
 * }
 * ```
 */
export const zip = <Sources extends readonly Iterable<unknown>[]>(
  ...sources: Sources
): Iterable<Zipped<Sources>> => ({
  *[Symbol.iterator](): Generator<Zipped<Sources>, void, unknown> {
    if (sources.length === 0) {
      return;
    }

    const iterators = sources.map((source) => source[Symbol.iterator]());
    const open = new Set(iterators);

    try {
      for (;;) {
        const tuple: unknown[] = [];
        for (const iterator of iterators) {
          const step = iterator.next();
          if (step.done) {
            open.delete(iterator);
            return;
          }
          tuple.push(step.value);
        }
        yield tuple as Zipped<Sources>;
      }
    } finally {
      for (const iterator of open) {
        iterator.return?.();
      }
    }
  },
});
