import {
  Array,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  PlatformError,
  Result,
} from "effect";
import { isInterfaceDeclaration } from "typescript/ast";
import { describe, expect, test } from "vitest";

import * as Location from "../src/Location.js";
import * as Compiler from "./fixtures/compiler.js";

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

const fixture = async <A, E>({
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
}): Promise<A> => {
  const compiler = await Compiler.open({ source: "export interface Value {}" });
  try {
    const declaration = Array.findFirst(
      compiler.source.statements,
      isInterfaceDeclaration,
    ).pipe(Option.getOrThrow);
    return await run({ source: compiler.source, declaration }).pipe(
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This test entry point completes all location reads before closing the compiler.
      Effect.provide(
        Layer.merge(
          FileSystem.layerNoop({ exists, readFileString: read }),
          Path.layer,
        ),
      ),
      Effect.runPromise,
    );
  } finally {
    await compiler.api.close();
  }
};

const locate = Effect.fnUntraced(function* ({
  declaration,
}: {
  readonly declaration: InterfaceDeclaration;
}) {
  const locations = yield* Location.make("/project/.generated");
  return yield* locations.locate(declaration);
});

describe("location", () => {
  test("positions_and_cache", async () => {
    expect.hasAssertions();
    let reads = 0;
    const result = await fixture({
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
  });

  test("missing_map", async () => {
    expect.hasAssertions();
    const result = await fixture({
      read: () => Effect.fail(missing),
      run: locate,
    });
    expect(result).toStrictEqual(Option.none());
  });

  test.each([
    ["malformed", Effect.succeed("not json")],
    ["permission", Effect.fail(permission)],
  ] as const)("%s", async (_name, read) => {
    expect.hasAssertions();
    const result = await fixture({
      read: () => read,
      run: (input) => locate(input).pipe(Effect.result),
    });
    expect(Result.isFailure(result)).toBe(true);
  });

  test("missing_repository", async () => {
    expect.hasAssertions();
    const result = await fixture({
      read: () => Effect.die("No map should be read"),
      exists: () => Effect.succeed(false),
      run: locate,
    });
    expect(result).toStrictEqual(Option.none());
  });

  test("unmapped_position", async () => {
    expect.hasAssertions();
    const map = JSON.stringify({
      version: 3,
      sources: [],
      names: [],
      mappings: "",
    });
    const result = await fixture({
      read: () => Effect.succeed(map),
      run: locate,
    });
    expect(result).toStrictEqual(Option.none());
  });
});
