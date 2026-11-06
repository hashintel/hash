import { Array, HashMap, Option, pipe } from "effect";
import { describe, expect, test } from "vitest";

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
  test("private_dependency", async () => {
    expect.hasAssertions();
    const ast = await ParserFixture.success({
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
      Catalogue.lookup(catalogue, { entrypoint: "fixture", path: ["Hidden"] }),
    ).toStrictEqual(Option.none());
  });

  test("type_only_alias_then_value", async () => {
    expect.hasAssertions();
    const ast = await ParserFixture.success({
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
  });

  test("nested_alias_paths", async () => {
    expect.hasAssertions();
    const ast = await ParserFixture.success({
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
  });

  test("namespace_restriction", async () => {
    expect.hasAssertions();
    const ast = await ParserFixture.success({
      source: 'export type * as Types from "./box.js";',
      files: { "box.d.ts": "export class Box { value: string }" },
    });
    const catalogue = Catalogue.fromAST(ast);
    expect(entry(catalogue, "Types").typeOnlyExport).toBe(true);
    expect(entry(catalogue, "Types", "Box").typeOnlyExport).toBe(true);
  });

  test("namespace_cycle", async () => {
    expect.hasAssertions();
    const ast = await ParserFixture.success({
      source:
        'export * as self from "./declarations.js"; export interface Box {}',
    });
    const catalogue = Catalogue.fromAST(ast);
    const box = entry(catalogue, "Box");
    expect(paths(catalogue)).toStrictEqual(["", "Box"]);
    expect(entry(catalogue, "self").name.path).toStrictEqual([]);
    expect(entry(catalogue, "self", "self", "Box").id).toBe(box.id);
    expect(HashMap.size(catalogue.byName)).toBe(3);
  });
});
