import { describe, expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Option, Record } from "effect";

import * as Sources from "./Sources.js";

const files: Record.ReadonlyRecord<string, string> = {
  "/scope.ts": [
    'import * as Whole from "./whole.js";',
    'import { named as renamed } from "./named.js";',
    'import fallback from "./fallback.js";',
    'export * from "./everything.js";',
    'export * as Space from "./space.js";',
    'export { remote as published } from "./remote.js";',
    "const local = 1;",
    "export { local as alias };",
  ].join("\n"),
  "/overloads.d.ts": [
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
  "/alias.d.ts": [
    "declare function conditional(): void;",
    "export { conditional as if, other as unrelated };",
    'export { ifElse as If, assume } from "./expression.js";',
  ].join("\n"),
  "/broken.ts": "export const = ;",
};

// A read of a file the fixtures do not name is a defect in the test.
const fixtures: Layer.Layer<Sources.Sources> = Sources.layer.pipe(
  Layer.provide(
    FileSystem.layerNoop({
      readFileString: (path) =>
        Effect.fromOption(Record.get(files, path)).pipe(Effect.orDie),
    }),
  ),
);

describe("sources", () => {
  layer(fixtures)((it) => {
    it.effect("scope_bindings", () =>
      Effect.gen(function* () {
        const sources = yield* Sources.Sources;
        const scope = yield* sources.scope("/scope.ts");

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
      }),
    );

    it.effect("declarations_overloads", () =>
      Effect.gen(function* () {
        const sources = yield* Sources.Sources;
        const { local } = yield* sources.declarations("/overloads.d.ts");

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
      }),
    );

    it.effect("declarations_alias_export", () =>
      Effect.gen(function* () {
        const sources = yield* Sources.Sources;
        const { local, exports } = yield* sources.declarations("/alias.d.ts");

        expect(Record.get(local, "conditional")).toStrictEqual(
          Option.some(["declare function conditional(): void;"]),
        );
        expect(Record.get(exports, "if")).toStrictEqual(
          Option.some("export { conditional as if };"),
        );
        expect(Record.get(exports, "If")).toStrictEqual(
          Option.some('export { ifElse as If } from "./expression.js";'),
        );
      }),
    );

    it.effect("syntax_error", () =>
      Effect.gen(function* () {
        const sources = yield* Sources.Sources;
        const error = yield* Effect.flip(sources.scope("/broken.ts"));

        expect(error.reason).toMatchObject({
          _tag: "SourceSyntax",
          file: "/broken.ts",
        });
      }),
    );
  });
});
