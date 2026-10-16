// oxlint-disable effecttsgo/unstable-api-usage -- FileSystem is unstable
// oxlint-disable effecttsgo/strict-effect-provide -- each test is an entry point that provides its own files
import { Effect, FileSystem, Layer, Option, Record } from "effect";
import { describe, expect, test } from "vitest";

import * as Sources from "./Sources.js";

// Each test reads only the files it names. Any other read is a defect in the test.
const read = <A, E>(
  contents: Record.ReadonlyRecord<string, string>,
  effect: (sources: Sources.Sources["Service"]) => Effect.Effect<A, E>,
): A =>
  Effect.flatMap(Effect.service(Sources.Sources), effect).pipe(
    Effect.provide(
      Sources.layer.pipe(
        Layer.provide(
          FileSystem.layerNoop({
            readFileString: (path) =>
              Effect.fromOption(Record.get(contents, path)).pipe(Effect.orDie),
          }),
        ),
      ),
    ),
    Effect.orDie,
    Effect.runSync,
  );

describe("sources", () => {
  test("scope_bindings", () => {
    expect.hasAssertions();
    const scope = read(
      {
        "/module.ts": [
          'import * as Whole from "./whole.js";',
          'import { named as renamed } from "./named.js";',
          'import fallback from "./fallback.js";',
          'export * from "./everything.js";',
          'export * as Space from "./space.js";',
          'export { remote as published } from "./remote.js";',
          "const local = 1;",
          "export { local as alias };",
        ].join("\n"),
      },
      (sources) => sources.scope("/module.ts"),
    );

    expect(scope.imports).toStrictEqual({
      Whole: { specifier: "./whole.js", imported: Option.none() },
      renamed: { specifier: "./named.js", imported: Option.some("named") },
      fallback: {
        specifier: "./fallback.js",
        imported: Option.some("default"),
      },
    });
    expect(scope.wildcards).toStrictEqual(["./everything.js"]);
    expect(scope.namespaces).toStrictEqual({ Space: "./space.js" });
    expect(scope.reexports).toStrictEqual({
      published: { local: "remote", specifier: Option.some("./remote.js") },
      alias: { local: "local", specifier: Option.none() },
    });
  });

  test("declarations_overloads", () => {
    expect.hasAssertions();
    const { local } = read(
      {
        "/module.d.ts": [
          "/** First overload. */",
          "export declare function pick(value: string): string;",
          "/** Second overload. */",
          "export declare function pick(value: number): number;",
          "export interface Shape {",
          "  /** The side length. */",
          "  readonly side: number; // trailing",
          "  readonly name: string;",
          "}",
        ].join("\n"),
      },
      (sources) => sources.declarations("/module.d.ts"),
    );

    expect(Record.get(local, "pick")).toStrictEqual(
      Option.some([
        "export declare function pick(value: string): string;",
        "export declare function pick(value: number): number;",
      ]),
    );
    expect(Record.get(local, "Shape")).toStrictEqual(
      Option.some([
        [
          "export interface Shape {",
          "  readonly side: number; ",
          "  readonly name: string;",
          "}",
        ].join("\n"),
      ]),
    );
  });

  test("declarations_alias_export", () => {
    expect.hasAssertions();
    const { local, exports } = read(
      {
        "/module.d.ts": [
          "declare function conditional(): void;",
          "export { conditional as if, other as unrelated };",
          'export { ifElse as If, assume } from "./expression.js";',
        ].join("\n"),
      },
      (sources) => sources.declarations("/module.d.ts"),
    );

    expect(Record.get(local, "conditional")).toStrictEqual(
      Option.some(["declare function conditional(): void;"]),
    );
    expect(Record.get(exports, "if")).toStrictEqual(
      Option.some("export { conditional as if };"),
    );
    expect(Record.get(exports, "If")).toStrictEqual(
      Option.some('export { ifElse as If } from "./expression.js";'),
    );
  });

  test("syntax_error", () => {
    expect.hasAssertions();
    const error = read({ "/broken.ts": "export const = ;" }, (sources) =>
      Effect.flip(sources.scope("/broken.ts")),
    );

    expect(error.reason).toMatchObject({
      _tag: "SourceSyntax",
      file: "/broken.ts",
    });
  });
});
