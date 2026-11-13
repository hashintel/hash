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

/** A module page as its rows, each as its kind and its name, and then the exports it documents: each one's kind, its name and the names of the rows of its counterpart. */
const pageOf = (
  { document }: Reference.Reference,
  path: readonly string[],
): readonly (readonly (string | readonly string[])[])[] => {
  const page = pipe(
    document.pages,
    Array.findFirst(
      (tree): tree is Tree.Page.Module =>
        tree.type === "module" &&
        tree.origin.name.path.join(".") === path.join("."),
    ),
    Option.getOrThrow,
  );

  return [
    Array.flatMap(page.groups, ({ rows }) =>
      Array.map(rows, ({ kind, label }) => `${kind} ${label.join(".")}`),
    ),
    Array.flatMap(page.groups, ({ exports }) =>
      Array.map(exports, ({ kind, origin, related }) => [
        kind,
        origin.name.path.join("."),
        ...Array.map(
          Array.appendAll(related.type, related.value),
          ({ label }) => label.join("."),
        ),
      ]),
    ),
  ];
};

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
      "value_under_its_own_name",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.success({
          source: `/** Box type. */ interface Box { readonly a: string }
/** Box value. */ declare const Box: number;
export type { Box };
export declare namespace Deep { export { Box as Again }; }`,
        });
        expect([
          pageOf(reference, []),
          pageOf(reference, ["Deep"]),
        ]).toStrictEqual([
          // The root exports the type alone, so it documents the type and links to the value where a name exports it.
          [
            ["module Deep", "interface Box", "property a"],
            [["interface", "Box", "Deep.Again"]],
          ],
          // `Deep.Again` is the value's shortest name, so its page documents the value, and lists the type the name also exports.
          [
            ["interface Again", "const Again"],
            [["const", "Deep.Again", "pkg.Box"]],
          ],
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
