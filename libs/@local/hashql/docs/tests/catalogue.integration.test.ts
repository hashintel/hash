import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, HashMap, Option, pipe } from "effect";

import * as AST from "../src/AST/index.js";
import * as Catalogue from "../src/Catalogue.js";
import * as ParserFixture from "./fixtures/parser.js";

const entry = (
  catalogue: Catalogue.Catalogue,
  ...path: string[]
): Catalogue.Entry =>
  Catalogue.lookup(catalogue, { entrypoint: "fixture", path }).pipe(
    Option.getOrThrow,
  );

const paths = (catalogue: Catalogue.Catalogue): readonly string[] =>
  Array.map(catalogue.entries, ({ name }) => name.path.join("."));

describe("catalogue", () => {
  it.effect(
    "private_dependency",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const ast = yield* ParserFixture.success({
        source:
          'import type { Hidden } from "./private.js"; export interface Public { value: Hidden }',
        files: { "private.d.ts": "export interface Hidden { value: string }" },
      });
      const catalogue = Catalogue.fromAST(ast);
      const declarations = pipe(
        ast.nodes(),
        Array.fromIterable,
        Array.filter(AST.Declaration.isDeclaration),
        Array.map(({ symbol }) => symbol.name),
      );
      expect(declarations).toContain("Hidden");
      expect(paths(catalogue)).toStrictEqual(["", "Public"]);
      expect(
        Catalogue.lookup(catalogue, {
          entrypoint: "fixture",
          path: ["Hidden"],
        }),
      ).toStrictEqual(Option.none());
    }),
  );

  it.effect(
    "type_only_alias_then_value",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const ast = yield* ParserFixture.success({
        source:
          'export type { Box as TypeBox } from "./box.js"; export { Box } from "./box.js";',
        files: { "box.d.ts": "export class Box { value: string }" },
      });
      const catalogue = Catalogue.fromAST(ast);
      const box = entry(catalogue, "Box");
      expect(box.name.path).toStrictEqual(["TypeBox"]);
      expect([box.typeOnlyExport, box.nameTypeOnlyExport]).toStrictEqual([
        false,
        true,
      ]);
      expect(entry(catalogue, "TypeBox").id).toBe(box.id);
      expect(paths(catalogue)).toStrictEqual(["", "TypeBox"]);
    }),
  );

  it.effect(
    "nested_alias_paths",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const ast = yield* ParserFixture.success({
        source:
          'export * as Original from "./box.js"; export * as Alias from "./box.js";',
        files: {
          "box.d.ts":
            "export namespace Nested { export interface Box { value: string } }",
        },
      });
      const catalogue = Catalogue.fromAST(ast);
      const original = entry(catalogue, "Original", "Nested", "Box");
      expect(entry(catalogue, "Alias", "Nested", "Box").id).toBe(original.id);
      expect(original.name.path).toStrictEqual(["Original", "Nested", "Box"]);
      expect(
        HashMap.get(catalogue.byName, {
          entrypoint: "fixture",
          path: ["Alias", "Nested", "Box"],
        }),
      ).toStrictEqual(Option.some(original.id));
    }),
  );

  it.effect(
    "shortest_path",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const ast = yield* ParserFixture.success({
        source:
          'export * as Outer from "./outer.js"; export { Box } from "./box.js";',
        files: {
          "outer.d.ts": 'export * as Inner from "./inner.js";',
          "inner.d.ts": 'export { Box } from "./box.js";',
          "box.d.ts": "export interface Box { value: string }",
        },
      });
      const catalogue = Catalogue.fromAST(ast);
      const box = entry(catalogue, "Outer", "Inner", "Box");
      expect(box.name.path).toStrictEqual(["Box"]);
      expect(entry(catalogue, "Box").id).toBe(box.id);
      expect(paths(catalogue)).toStrictEqual([
        "",
        "Outer",
        "Outer.Inner",
        "Box",
      ]);
    }),
  );

  it.effect(
    "shorter_type_only_path",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const ast = yield* ParserFixture.success({
        source:
          'export * as Outer from "./outer.js"; export type { Box } from "./box.js";',
        files: {
          "outer.d.ts": 'export { Box } from "./box.js";',
          "box.d.ts": "export class Box { value: string }",
        },
      });
      const box = entry(Catalogue.fromAST(ast), "Box");
      expect(box.name.path).toStrictEqual(["Box"]);
      expect([box.typeOnlyExport, box.nameTypeOnlyExport]).toStrictEqual([
        false,
        true,
      ]);
    }),
  );

  it.effect(
    "value_names",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const ast = yield* ParserFixture.success({
        source: `export type { Box } from "./box.js";
export * as Far from "./far.js";
export * as Near from "./near.js";
export type { Only } from "./box.js";
export { Plain } from "./box.js";`,
        files: {
          "far.d.ts": 'export * as Deep from "./near.js";',
          "near.d.ts": 'export { Box as Again } from "./box.js";',
          "box.d.ts":
            "export class Box { value: string } export class Only {} export class Plain {}",
        },
      });
      const catalogue = Catalogue.fromAST(ast);
      const valueName = (...path: string[]): Option.Option<readonly string[]> =>
        Option.map(entry(catalogue, ...path).valueName, (name) => name.path);
      expect([
        valueName("Box"),
        valueName("Only"),
        valueName("Plain"),
      ]).toStrictEqual([
        // The shortest name is type-only, and of the two that permit value use the shorter names the value, though the walk meets the longer first.
        Option.some(["Near", "Again"]),
        Option.none(),
        Option.some(["Plain"]),
      ]);
      expect(
        Option.map(
          Catalogue.valued(entry(catalogue, "Box")),
          ({ name, nameTypeOnlyExport }) => [name.path, nameTypeOnlyExport],
        ),
      ).toStrictEqual(Option.some([["Near", "Again"], false]));
    }),
  );

  it.effect(
    "namespace_restriction",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const ast = yield* ParserFixture.success({
        source: 'export type * as Types from "./box.js";',
        files: { "box.d.ts": "export class Box { value: string }" },
      });
      const catalogue = Catalogue.fromAST(ast);
      expect(entry(catalogue, "Types").typeOnlyExport).toBe(true);
      expect(entry(catalogue, "Types", "Box").typeOnlyExport).toBe(true);
    }),
  );

  it.effect(
    "namespace_cycle",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const ast = yield* ParserFixture.success({
        source:
          'export * as self from "./declarations.js"; export interface Box {}',
      });
      const catalogue = Catalogue.fromAST(ast);
      const box = entry(catalogue, "Box");
      expect(paths(catalogue)).toStrictEqual(["", "Box"]);
      expect(entry(catalogue, "self").name.path).toStrictEqual([]);
      expect(entry(catalogue, "self", "self", "Box").id).toBe(box.id);
      expect(HashMap.size(catalogue.byName)).toBe(3);
    }),
  );
});
