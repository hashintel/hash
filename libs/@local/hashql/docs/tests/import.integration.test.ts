import { Option } from "effect";
import { beforeAll, describe, expect, test } from "vitest";

import * as Catalogue from "../src/Catalogue.js";
import * as Import from "../src/Import.js";
import * as CompilerFixture from "./fixtures/compiler.js";
import * as ParserFixture from "./fixtures/parser.js";

let loaded: Catalogue.Catalogue | null = null;
const source = [
  'export type { Box as TypeBox } from "./box.js";',
  'export { Box } from "./box.js";',
  'export type * as Types from "./box.js";',
  'export * as Values from "./box.js";',
  "export namespace Nested { export namespace Inner { export const value: number } }",
  "export interface Model { value: string }",
  'declare const value: number; export { value as "odd-name" };',
  "declare const reserved: number; export { reserved as default };",
].join("\n");

const snippet = (...path: string[]): string => {
  const catalogue = Option.fromNullishOr(loaded).pipe(Option.getOrThrow);
  return Catalogue.lookup(catalogue, { entrypoint: "fixture", path }).pipe(
    Option.getOrThrow,
    Import.fromEntry(catalogue),
    Import.print,
  );
};

describe("imports", () => {
  beforeAll(async () => {
    loaded = Catalogue.fromAST(
      await ParserFixture.success({
        source,
        files: { "box.d.ts": "export class Box { value: string }" },
      }),
    );
  });

  test("entrypoint", () => {
    expect.hasAssertions();
    expect(snippet()).toBe('import * as fixture from "fixture";');
  });

  test("canonical_type_only", () => {
    expect.hasAssertions();
    expect(snippet("Box")).toBe('import type { TypeBox } from "fixture";');
  });

  test("intrinsic_type", () => {
    expect.hasAssertions();
    expect(snippet("Model")).toBe('import type { Model } from "fixture";');
  });

  test("namespace_restriction", () => {
    expect.hasAssertions();
    expect(snippet("Types")).toBe('import type { Types } from "fixture";');
    expect(snippet("Values")).toBe('import type { Types } from "fixture";');
  });

  test("nested_binding", () => {
    expect.hasAssertions();
    expect(snippet("Nested", "Inner")).toBe(
      'import { Nested } from "fixture";',
    );
  });

  test("reserved_binding", async () => {
    expect.hasAssertions();
    expect(snippet("default")).toBe(
      'import { "default" as api } from "fixture";',
    );
    const fixture = await CompilerFixture.open({
      source: snippet("default").replace('"fixture"', '"./api.js"'),
      files: {
        "api.d.ts": source,
        "box.d.ts": "export class Box { value: string }",
      },
    });
    try {
      await expect(
        fixture.project.program.getSyntacticDiagnostics(fixture.file),
      ).resolves.toStrictEqual([]);
      await expect(
        fixture.project.program.getSemanticDiagnostics(fixture.file),
      ).resolves.toStrictEqual([]);
    } finally {
      await fixture.api.close();
    }
  });

  test("escaped_specifiers", () => {
    expect.hasAssertions();
    expect(
      Import.print({
        module: 'pkg"quoted',
        imported: Option.some('name"quoted'),
        binding: "api",
        typeOnly: false,
      }),
    ).toBe(String.raw`import { "name\"quoted" as api } from "pkg\"quoted";`);
  });

  test("quoted_export", () => {
    expect.hasAssertions();
    expect(snippet("odd-name")).toBe(
      'import { "odd-name" as api } from "fixture";',
    );
  });
});
