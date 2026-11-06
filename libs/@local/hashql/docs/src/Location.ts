import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import {
  Context,
  Effect,
  FileSystem,
  Layer,
  MutableHashMap,
  Option,
  Path,
} from "effect";
import { isSourceFile } from "typescript/ast";
import { getNameOfDeclaration } from "typescript/ast/utils";

import type { Cause, PlatformError } from "effect";
import type { Declaration, Node, SourceFile } from "typescript/ast";

/** A repository-relative source file and one-based line from a declaration map. */
export interface Location {
  readonly file: string;
  readonly line: number;
}

/** Resolves retained syntax to source positions, caching declaration maps within one extraction. */
export class Locations extends Context.Service<
  Locations,
  {
    readonly locate: (
      node: Declaration | SourceFile,
    ) => Effect.Effect<
      Option.Option<Location>,
      Cause.UnknownError | PlatformError.PlatformError
    >;
  }
>()("@local/hashql-docs/Location/Locations") {}

const repositoryOf = Effect.fnUntraced(function* (directory: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let current = directory;
  for (;;) {
    const exists = yield* fs.exists(path.join(current, ".git"));
    if (exists) {
      return Option.some(current);
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return Option.none<string>();
    }
    current = parent;
  }
});

/** Missing maps give no location. Malformed maps and filesystem failures remain failures. */
export const make = Effect.fnUntraced(function* (directory: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repository = yield* repositoryOf(directory);
  const maps = MutableHashMap.empty<string, Option.Option<TraceMap>>();
  const mapOf = Effect.fnUntraced(function* (file: string) {
    const known = MutableHashMap.get(maps, file);
    if (Option.isSome(known)) {
      return known.value;
    }
    const contents = yield* fs.readFileString(`${file}.map`).pipe(
      Effect.asSome,
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeedNone),
    );
    const map = yield* Option.match(contents, {
      onNone: () => Effect.succeed(Option.none<TraceMap>()),
      onSome: (text) =>
        Effect.try(() => new TraceMap(text, `${file}.map`)).pipe(Effect.asSome),
    });
    MutableHashMap.set(maps, file, map);
    return map;
  });
  const locate = Effect.fnUntraced(function* (
    declaration: Declaration | SourceFile,
  ) {
    if (Option.isNone(repository)) {
      return Option.none<Location>();
    }
    const source = declaration.getSourceFile();
    const map = yield* mapOf(source.fileName);
    if (Option.isNone(map)) {
      return Option.none<Location>();
    }
    let anchor: Node = declaration;
    if (!isSourceFile(declaration)) {
      anchor = getNameOfDeclaration(declaration) ?? declaration;
    }
    const { line, character } = source.getLineAndCharacterOfPosition(
      anchor.getStart(),
    );
    const original = yield* Effect.try(() =>
      originalPositionFor(map.value, { line: line + 1, column: character }),
    );
    if (original.source === null) {
      return Option.none<Location>();
    }
    const file = path.resolve(original.source);
    return Option.some<Location>({
      file: path.relative(repository.value, file),
      line: isSourceFile(declaration) ? 1 : original.line,
    });
  });
  return Locations.of({ locate });
});

export const layer = (
  directory: string,
): Layer.Layer<
  Locations,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> => Layer.effect(Locations, make(directory));
