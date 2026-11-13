import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import {
  Context,
  Effect,
  FileSystem,
  Layer,
  MutableHashMap,
  Option,
  Schema,
} from "effect";
import { isSourceFile } from "typescript/ast";
import { getNameOfDeclaration } from "typescript/ast/utils";

import * as DocumentationError from "./DocumentationError.js";
import * as Source from "./internal/ast/source.js";
import * as Program from "./TypeScript/Program.js";

import type { Cause, PlatformError } from "effect";
import type { Declaration, Node, SourceFile } from "typescript/ast";

/** A source file, as its path from the root of the repository that holds it, and a one-based line from a declaration map. */
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

/**
 * Missing maps give no location. Malformed maps and filesystem failures remain failures.
 *
 * The maps beside the declarations name each source by its path from the repository's root, so a location reads the same wherever the declarations are.
 */
export const make = Effect.fnUntraced(function* () {
  const fs = yield* FileSystem.FileSystem;
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
        Effect.try(() => new TraceMap(text)).pipe(Effect.asSome),
    });
    MutableHashMap.set(maps, file, map);
    return map;
  });
  const locate = Effect.fnUntraced(function* (
    declaration: Declaration | SourceFile,
  ) {
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
    return Option.some<Location>({
      file: original.source,
      line: isSourceFile(declaration) ? 1 : original.line,
    });
  });
  return Locations.of({ locate });
});

/** `failure` with the declaration its comment is on, where the program holds the comment and a declaration map tells where the package's source declares that declaration. Any other failure stays as it is. */
const placed = Effect.fnUntraced(function* (
  failure: DocumentationError.DocumentationError,
) {
  const program = yield* Program.Program;
  const locations = yield* Locations;
  const file = yield* program.sourceFile(failure.file);
  const documented = Option.flatMap(
    Option.all({ file, start: failure.start }),
    ({ file: source, start }) => Source.documentedAt(source, start),
  );
  if (Option.isNone(documented)) {
    return failure;
  }

  // SAFETY: a comment's node is a declaration or its file, which is what a declaration map places.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The compiler types a node with a comment as any node.
  const declaration = documented.value as Declaration | SourceFile;
  const location = yield* locations.locate(declaration);

  return Option.match(location, {
    onNone: () => failure,
    onSome: (found) =>
      DocumentationError.DocumentationError.make({
        file: failure.file,
        reason: failure.reason,
        declaration: {
          names: Source.declaredNames(declaration),
          file: found.file,
          line: found.line,
        },
      }),
  });
});

/**
 * Fails `effect` with each comment failure at the declaration its comment is on, as the package's source declares it.
 *
 * The parser reads a copy of the package's built declarations, so a failure of its own names that copy. An author edits the source.
 */
export const locating = <A, E, R>(
  effect: Effect.Effect<A, E | DocumentationError.DocumentationError, R>,
): Effect.Effect<
  A,
  | E
  | DocumentationError.DocumentationError
  | Cause.UnknownError
  | PlatformError.PlatformError,
  R | Locations | Program.Program
> =>
  Effect.catchIf(
    effect,
    Schema.is(DocumentationError.DocumentationError),
    (failure) => Effect.flatMap(placed(failure), Effect.fail),
  );

export const layer: Layer.Layer<Locations, never, FileSystem.FileSystem> =
  Layer.effect(Locations, make());
