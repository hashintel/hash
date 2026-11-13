import { describe, expect, it } from "@effect/vitest";
import {
  Array,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  PlatformError,
  Result,
} from "effect";
import { isInterfaceDeclaration } from "typescript/ast";

import * as Location from "../src/Location.js";
import * as Compiler from "./fixtures/compiler.js";
import * as Reference from "./fixtures/reference.js";

import type { Scope } from "effect";
import type { InterfaceDeclaration, SourceFile } from "typescript/ast";

const missing = PlatformError.systemError({
  _tag: "NotFound",
  module: "FileSystem",
  method: "readFileString",
});
const permission = PlatformError.systemError({
  _tag: "PermissionDenied",
  module: "FileSystem",
  method: "readFileString",
});
const sourceMap = JSON.stringify({
  version: 3,
  sources: ["libs/pkg/src/value.ts"],
  names: [],
  mappings: "AAKA,iBAKA",
});

/** Runs `run` over a compiled declaration, with a filesystem that reads through `read` and `exists`. The compiler stops when the test's scope closes. */
/** A map with no mapping in it. */
const emptyMap = JSON.stringify({
  version: 3,
  sources: [],
  names: [],
  mappings: "",
});

const fixture = Effect.fnUntraced(function* <A, E>({
  read,
  run,
}: {
  readonly read: FileSystem.FileSystem["readFileString"];
  readonly run: (input: {
    readonly source: SourceFile;
    readonly declaration: InterfaceDeclaration;
  }) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>;
}): Effect.fn.Return<
  A,
  E | Layer.Error<ReturnType<typeof Compiler.layer>>,
  Scope.Scope
> {
  const compiler = yield* Layer.build(
    Compiler.layer({ source: "export interface Value {}" }),
  );
  const { source } = Context.get(compiler, Compiler.Fixture);
  const declaration = Array.findFirst(
    source.statements,
    isInterfaceDeclaration,
  ).pipe(Option.getOrThrow);
  const files = yield* Layer.build(
    Layer.merge(FileSystem.layerNoop({ readFileString: read }), Path.layer),
  );

  return yield* run({ source, declaration }).pipe(Effect.provide(files));
});

const locate = Effect.fnUntraced(function* ({
  declaration,
}: {
  readonly declaration: InterfaceDeclaration;
}) {
  const locations = yield* Location.make();
  return yield* locations.locate(declaration);
});

/** What building the reference for `source` fails with, as its author reads it. */
const refusal = (source: string): Effect.Effect<string> =>
  Effect.map(
    Reference.run({ source }),
    Result.match({
      onFailure: (failure) => failure.message,
      onSuccess: () => "",
    }),
  );

describe("location", () => {
  it.effect.each([
    [
      "function",
      "\n/** Reads {@link Missing}. */ export declare function read(): void;",
      "read at index.d.ts:2: No declaration for the link to Missing",
    ],
    [
      "member",
      "export interface Box {\n  /** The {@link Missing}. */ readonly value: string;\n}",
      "Box.value at index.d.ts:2: No declaration for the link to Missing",
    ],
    [
      "call",
      "export declare const run: {\n  /** Runs. @param nope - Nothing. */ (): void;\n};",
      "run at index.d.ts:2: The @param nope names no parameter",
    ],
    [
      "variable",
      "\n\n/** @stability unknown */ export declare const value: number;",
      "value at index.d.ts:3: Unknown stability",
    ],
    [
      "repeated_tag",
      "/** @since 1.0.0\n * @since 2.0.0 */ export type Kind = string;",
      "Kind at index.d.ts:2: Repeated singleton tag @since",
    ],
    [
      "module",
      "/** Reads {@link Missing}. @module */\n/** A value. */ export declare const value: number;",
      "index.d.ts:1: No declaration for the link to Missing",
    ],
    [
      "stray_module",
      "/** A value. */ export declare const value: number;\n/** Stray. @module */ export declare const other: number;",
      "other at index.d.ts:2: The @module comment does not lead its file",
    ],
    [
      "constructor",
      "export declare namespace Deep {\n  export class Box {\n    /** Makes with {@link Missing}. */\n    constructor(value: string);\n  }\n}",
      "Deep.Box at index.d.ts:4: No declaration for the link to Missing",
    ],
    [
      "reexport",
      "interface Value {}\n/** Renamed. */\nexport { Value as Other };",
      "index.d.ts:3: The comment is on a re-export",
    ],
  ] as const)(
    "refusal_%s",
    Effect.fnUntraced(function* ([, source, expected]: readonly [
      string,
      string,
      string,
    ]) {
      expect.hasAssertions();
      const message = yield* refusal(source);
      expect(message.slice(0, expected.length)).toBe(expected);
    }),
  );

  it.effect(
    "positions_and_cache",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      let reads = 0;
      const result = yield* fixture({
        read: () => {
          reads += 1;
          return Effect.succeed(sourceMap);
        },
        run: ({ source, declaration }) =>
          Effect.gen(function* () {
            const locations = yield* Location.make();
            const item = yield* locations.locate(declaration);
            const namespace = yield* locations.locate(source);
            return { item, namespace };
          }),
      });
      expect(result).toStrictEqual({
        item: Option.some({ file: "libs/pkg/src/value.ts", line: 11 }),
        namespace: Option.some({ file: "libs/pkg/src/value.ts", line: 1 }),
      });
      expect(reads).toBe(1);
    }),
  );

  it.effect(
    "missing_map",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const result = yield* fixture({
        read: () => Effect.fail(missing),
        run: locate,
      });
      expect(result).toStrictEqual(Option.none());
    }),
  );

  it.effect.each([
    ["malformed", Effect.succeed("not json")],
    ["permission", Effect.fail(permission)],
  ] as const)(
    "%s",
    Effect.fnUntraced(function* ([, read]: readonly [
      string,
      Effect.Effect<string, PlatformError.PlatformError>,
    ]) {
      expect.hasAssertions();
      const result = yield* fixture({
        read: () => read,
        run: (input) => locate(input).pipe(Effect.result),
      });
      expect(Result.isFailure(result)).toBe(true);
    }),
  );

  it.effect(
    "unmapped_position",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const result = yield* fixture({
        read: () => Effect.succeed(emptyMap),
        run: locate,
      });
      expect(result).toStrictEqual(Option.none());
    }),
  );
});
