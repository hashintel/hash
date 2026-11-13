import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, Option, pipe } from "effect";

import * as Reference from "./fixtures/reference.js";

import type * as Tree from "../src/Tree/index.js";

/** The rows the index of the fixture's module lists, each as its kind and its name. */
const rowsOf = ({
  document,
}: Reference.Reference): readonly (readonly [Tree.Row.Kind, string])[] =>
  pipe(
    document.pages,
    Array.findFirst((tree): tree is Tree.Page.Module => tree.type === "module"),
    Option.getOrThrow,
    ({ groups }) => Array.flatMap(groups, ({ rows }) => rows),
    Array.map(({ kind, label }) => [kind, label.join(".")] as const),
  );

describe("related", () => {
  describe("listed", () => {
    it.effect(
      "type_only_alias_apart",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.success({
          source: `export interface Box {}
export declare const Box: number;
export type { Box as Shape };`,
        });
        expect(rowsOf(reference)).toStrictEqual([
          ["interface", "Box"],
          ["interface", "Shape"],
          ["const", "Box"],
        ]);
      }),
    );

    it.effect(
      "alias_apart",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.success({
          source: `export interface Box {}
export declare const Box: number;
export { Box as Shape };`,
        });
        expect(rowsOf(reference)).toStrictEqual([
          ["interface", "Box"],
          ["interface", "Shape"],
          ["const", "Box"],
          ["const", "Shape"],
        ]);
      }),
    );
  });
});
