import { describe, expect, layer } from "@effect/vitest";
import { Array, Effect, FileSystem, Layer, Path, Record } from "effect";

import * as Signature from "./Signature.js";
import * as Sources from "./Sources.js";

import type { TransformError } from "./TransformError.js";

const declaration = "/declarations/program/Module.d.ts";

const files: Record.ReadonlyRecord<string, string> = {
  "/src/program/Module.ts": [
    "declare function conditional(): void;",
    "export { conditional as if };",
  ].join("\n"),
  [declaration]: [
    'import * as Type from "../type/index.js";',
    'import type { Other } from "./Other.js";',
    'import type { Types } from "effect";',
    "/** Not exported, so it has no page. */",
    "interface Hidden<T> {",
    "    readonly value: T;",
    "}",
    "/** Picks a value. */",
    "export declare function pick<T extends Type.Any>(value: T, other: Other): Hidden<T>;",
    "/** Picks every key. */",
    "export declare function pick<K>(key: K): {",
    "    [P in keyof K]: K[P] extends infer U ? U : Other;",
    "};",
    "declare function conditional(): Types.Invariant<Other>;",
    "export { conditional as if };",
  ].join("\n"),
};

// A read of a file the fixtures do not name is a defect in the test.
const fixtures: Layer.Layer<Sources.Sources | Path.Path> = Layer.mergeAll(
  Sources.layer.pipe(
    Layer.provide(
      FileSystem.layerNoop({
        readFileString: (path) =>
          Effect.fromOption(Record.get(files, path)).pipe(Effect.orDie),
      }),
    ),
  ),
  Path.layer,
);

const make = (
  name: string,
): Effect.Effect<
  Signature.Signature,
  TransformError,
  Sources.Sources | Path.Path
> =>
  Signature.make({
    name,
    source: "/src/program/Module.ts",
    declaration,
    root: "/declarations",
    exporters: ["/src/program/Module.ts"],
  });

// A reference reads as the text it spans and the path it resolves.
const shown = ({
  code,
  references,
}: Signature.Signature): readonly (readonly [string, string])[] =>
  Array.map(
    references,
    ({ start, end, path }) =>
      [code.slice(start, end), Array.join(path, ".")] as const,
  );

describe("signature", () => {
  layer(fixtures)((it) => {
    it.effect("overloads_code", () =>
      Effect.gen(function* () {
        const { code } = yield* make("pick");

        expect(code).toBe(
          [
            "export declare function pick<T extends Type.Any>(value: T, other: Other): Hidden<T>;",
            "export declare function pick<K>(key: K): {",
            "    [P in keyof K]: K[P] extends infer U ? U : Other;",
            "};",
          ].join("\n"),
        );
      }),
    );

    // Type parameters, the mapped key and the `infer` binding name no declaration.
    it.effect("references_skip_bound_names", () =>
      Effect.gen(function* () {
        const signature = yield* make("pick");

        expect(shown(signature)).toStrictEqual([
          ["Type", "Type"],
          ["Any", "Type.Any"],
          ["Other", "Other"],
          ["Hidden", "Hidden"],
          ["Other", "Other"],
        ]);
      }),
    );

    it.effect("context_excludes_shown", () =>
      Effect.gen(function* () {
        const { context } = yield* make("pick");

        expect(context).toBe(
          [
            'import * as Type from "#declarations/type/index.js";',
            'import type { Other } from "#declarations/program/Other.js";',
            'import type { Types } from "effect";',
            "interface Hidden<T> {\n    readonly value: T;\n}",
            "declare function conditional(): Types.Invariant<Other>;",
          ].join("\n"),
        );
      }),
    );

    it.effect("alias_export", () =>
      Effect.gen(function* () {
        const signature = yield* make("if");

        expect(signature.code).toBe(
          [
            "declare function conditional(): Types.Invariant<Other>;",
            "export { conditional as if };",
          ].join("\n"),
        );
        expect(shown(signature)).toStrictEqual([
          ["Types", "Types"],
          ["Invariant", "Types.Invariant"],
          ["Other", "Other"],
        ]);
      }),
    );

    it.effect("undeclared_name", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(make("missing"));

        expect(error.reason).toMatchObject({ _tag: "MalformedAnalysis" });
      }),
    );
  });
});
