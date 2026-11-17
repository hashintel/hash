/**
 * Writes the text of a tree through an explicit stack, so a printer handles any nesting depth that fits in memory.
 *
 * @internal
 */
import { Array, Result } from "effect";
import { dual, flow } from "effect/Function";

/** A part of the tree that a printer expands into further steps. */
export interface Node {
  readonly _tag: string;
}

/**
 * Returns a printer that concatenates the text of its steps, replacing each node with the steps `expand` returns for it.
 *
 * Steps still to write wait on an array instead of the call stack. A printer whose `expand` handles one level of the tree therefore never recurses, however deep the tree nests. The printer stops at the first node `expand` fails on and returns that failure.
 */
export const tryPrinter =
  <N extends Node, E>(
    expand: (node: N) => Result.Result<readonly (string | N)[], E>,
  ) =>
  (steps: readonly (string | N)[]): Result.Result<string, E> => {
    const pending = steps.toReversed();
    const output: string[] = [];

    for (let step = pending.pop(); step !== undefined; step = pending.pop()) {
      if (typeof step === "string") {
        output.push(step);
      } else {
        const expanded = expand(step);

        if (Result.isFailure(expanded)) {
          return Result.fail(expanded.failure);
        }

        for (const next of expanded.success.toReversed()) {
          pending.push(next);
        }
      }
    }

    return Result.succeed(output.join(""));
  };

/** Returns a printer as {@link tryPrinter} does, for an `expand` that cannot fail. */
export const printer = <N extends Node>(
  expand: (node: N) => readonly (string | N)[],
): ((steps: readonly (string | N)[]) => string) =>
  flow(tryPrinter(flow(expand, Result.succeed)), Result.merge);

/** Concatenates the steps of each item, with `separator` between consecutive items. */
export const separated: {
  <A, N extends Node>(
    separator: string,
    steps: (item: A) => readonly (string | N)[],
  ): (items: readonly A[]) => readonly (string | N)[];
  <A, N extends Node>(
    items: readonly A[],
    separator: string,
    steps: (item: A) => readonly (string | N)[],
  ): readonly (string | N)[];
} = dual(
  (args) => Array.isArray(args[0]),
  <A, N extends Node>(
    items: readonly A[],
    separator: string,
    steps: (item: A) => readonly (string | N)[],
  ): readonly (string | N)[] =>
    Array.flatten(Array.intersperse(Array.map(items, steps), [separator])),
);
