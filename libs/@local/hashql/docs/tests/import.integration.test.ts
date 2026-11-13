import { describe, expect, it, test } from "@effect/vitest";
import { Context, Effect, Layer, Option } from "effect";

import * as Catalogue from "../src/Catalogue.js";
import * as Import from "../src/Import.js";
import * as CompilerFixture from "./fixtures/compiler.js";
import * as ParserFixture from "./fixtures/parser.js";

const source = [
  'export type { Box as TypeBox } from "./box.js";',
  'export { Box } from "./box.js";',
  'export type * as Types from "./box.js";',
  'export * as Values from "./box.js";',
  "export namespace Nested { export namespace Inner { export const value: number } }",
  "export interface Model { value: string }",
  'declare const value: number; export { value as "odd-name" };',
  "declare const reserved: number; export { reserved as default };",
  "declare const evaluated: number; export { evaluated as eval };",
  "declare const given: number; export { given as arguments };",
].join("\n");

const box = "export class Box { value: string }";

const parsed = ParserFixture.success({
  source,
  files: { "box.d.ts": box },
}).pipe(Effect.map(Catalogue.fromAST));

/** The import of the export at `path`, as the reference prints it. */
const snippet = Effect.fnUntraced(function* (...path: string[]) {
  const catalogue = yield* parsed;

  return Catalogue.lookup(catalogue, { entrypoint: "fixture", path }).pipe(
    Option.getOrThrow,
    Import.fromEntry(catalogue),
    Import.print,
  );
});

describe("imports", () => {
  it.effect(
    "entrypoint",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(yield* snippet()).toBe('import * as fixture from "fixture";');
    }),
  );

  it.effect(
    "canonical_type_only",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(yield* snippet("Box")).toBe(
        'import type { TypeBox } from "fixture";',
      );
    }),
  );

  it.effect(
    "intrinsic_type",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(yield* snippet("Model")).toBe(
        'import type { Model } from "fixture";',
      );
    }),
  );

  it.effect(
    "namespace_restriction",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(yield* snippet("Types")).toBe(
        'import type { Types } from "fixture";',
      );
      expect(yield* snippet("Values")).toBe(
        'import type { Types } from "fixture";',
      );
    }),
  );

  it.effect(
    "nested_binding",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(yield* snippet("Nested", "Inner")).toBe(
        'import { Nested } from "fixture";',
      );
    }),
  );

  it.effect(
    "reserved_binding",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const printed = yield* snippet("default");
      expect(printed).toBe('import { "default" as api } from "fixture";');
      const services = yield* Layer.build(
        CompilerFixture.layer({
          source: printed.replace('"fixture"', '"./api.js"'),
          files: { "api.d.ts": source, "box.d.ts": box },
        }),
      );
      const { project, file } = Context.get(services, CompilerFixture.Fixture);
      expect(
        yield* Effect.promise(() =>
          project.program.getSyntacticDiagnostics(file),
        ),
      ).toStrictEqual([]);
      expect(
        yield* Effect.promise(() =>
          project.program.getSemanticDiagnostics(file),
        ),
      ).toStrictEqual([]);
    }),
  );

  it.effect(
    "strict_binding",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(yield* snippet("eval")).toBe(
        'import { "eval" as api } from "fixture";',
      );
      expect(yield* snippet("arguments")).toBe(
        'import { "arguments" as api } from "fixture";',
      );
    }),
  );

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

  it.effect(
    "quoted_export",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(yield* snippet("odd-name")).toBe(
        'import { "odd-name" as api } from "fixture";',
      );
    }),
  );
});
