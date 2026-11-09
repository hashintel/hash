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
  sources: ["/project/src/value.ts"],
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
  exists = (path) => Effect.succeed(path === "/project/.git"),
  run,
}: {
  readonly read: FileSystem.FileSystem["readFileString"];
  readonly exists?: FileSystem.FileSystem["exists"];
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
    Layer.merge(
      FileSystem.layerNoop({ exists, readFileString: read }),
      Path.layer,
    ),
  );

  return yield* run({ source, declaration }).pipe(Effect.provide(files));
});

const locate = Effect.fnUntraced(function* ({
  declaration,
}: {
  readonly declaration: InterfaceDeclaration;
}) {
  const locations = yield* Location.make("/project/.generated");
  return yield* locations.locate(declaration);
});

describe("location", () => {
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
            const locations = yield* Location.make("/project/.generated");
            const item = yield* locations.locate(declaration);
            const namespace = yield* locations.locate(source);
            return { item, namespace };
          }),
      });
      expect(result).toStrictEqual({
        item: Option.some({ file: "src/value.ts", line: 11 }),
        namespace: Option.some({ file: "src/value.ts", line: 1 }),
      });
      expect(reads).toBe(1);
    }),
  );

  it.effect(
    "relative_directory",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const result = yield* fixture({
        read: () => Effect.succeed(sourceMap),
        run: ({ declaration }) =>
          Effect.gen(function* () {
            const path = yield* Path.Path;
            const locations = yield* Location.make(
              path.relative(path.resolve("."), "/project/.generated"),
            );
            return yield* locations.locate(declaration);
          }),
      });
      expect(result).toStrictEqual(
        Option.some({ file: "src/value.ts", line: 11 }),
      );
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
    "missing_repository",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const result = yield* fixture({
        read: () => Effect.die("No map should be read"),
        exists: () => Effect.succeed(false),
        run: locate,
      });
      expect(result).toStrictEqual(Option.none());
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
