import { describe, expect, layer } from "@effect/vitest";
import {
  Array,
  Effect,
  FileSystem,
  Layer,
  Option,
  Record,
  Struct,
  pipe,
} from "effect";

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
  "/statements.d.ts": [
    'import type { Thing } from "./thing.js";',
    'import * as Space from "../space.js";',
    "/** Documented. */",
    'export declare const value: import("./other.js").Other; // trailing',
    "export { value as alias };",
    'export * from "./everything.js";',
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

        const texts = (name: string): Option.Option<readonly string[]> =>
          pipe(
            local,
            Record.get(name),
            Option.map(Array.map(Struct.get("text"))),
          );

        expect(texts("pick")).toStrictEqual(
          Option.some([
            "export declare function pick(value: string): string;",
            "export declare function pick(value: number): number;",
          ]),
        );
        expect(texts("Shape")).toStrictEqual(
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

    it.effect("declarations_scope_statements", () =>
      Effect.gen(function* () {
        const sources = yield* Sources.Sources;
        const { statements } = yield* sources.declarations("/statements.d.ts");

        // Each specifier's offsets point at its quoted literal in the comment-free text.
        expect(
          Array.map(statements, ({ names, text, specifiers }) => ({
            names,
            text,
            specifiers: Array.map(specifiers, ({ start, end, value }) => [
              text.slice(start, end),
              value,
            ]),
          })),
        ).toStrictEqual([
          {
            names: ["Thing"],
            text: 'import type { Thing } from "./thing.js";',
            specifiers: [['"./thing.js"', "./thing.js"]],
          },
          {
            names: ["Space"],
            text: 'import * as Space from "../space.js";',
            specifiers: [['"../space.js"', "../space.js"]],
          },
          {
            names: ["value"],
            text: 'export declare const value: import("./other.js").Other;',
            specifiers: [['"./other.js"', "./other.js"]],
          },
        ]);
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
