/**
 * Copies the SDK's declarations, its entrypoints and its TSDoc configuration into `.generated`, where the extraction reads them.
 *
 * @module
 */
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Array, Effect, FileSystem, Order, Path, Schema, pipe } from "effect";

/** The fields of the SDK's `package.json` this reads: its name, and the declaration file of each entrypoint in its `exports` map. */
const PackageJson = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.String,
    exports: Schema.Record(
      Schema.String,
      Schema.Struct({ types: Schema.String }),
    ),
  }),
);

/** A declaration map as TypeScript writes it. Each source is relative to `sourceRoot`, which is relative to the map's own directory. */
const DeclarationMap = Schema.fromJsonString(
  Schema.Struct({
    version: Schema.Finite,
    file: Schema.String,
    sourceRoot: Schema.String,
    sources: Schema.Array(Schema.String),
    names: Schema.Array(Schema.String),
    mappings: Schema.String,
  }),
);

/** One `[entrypoint, declaration file]` pair per entrypoint, as `src/Generation.ts` reads it. */
const Roots = Schema.fromJsonString(
  Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
  { space: 2 },
);

const copy = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sdk = path.join(import.meta.dirname, "..", "..", "sdk", "typescript");
  const dist = path.join(sdk, "dist");
  const generated = path.join(import.meta.dirname, "..", ".generated");
  const repository = path.join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
    "..",
  );

  // A module the SDK renamed or removed would otherwise linger from an earlier copy.
  yield* fs.remove(generated, { recursive: true, force: true });

  const files = yield* fs.readDirectory(dist, { recursive: true });

  yield* Effect.forEach(
    Array.filter(files, (file) => file.endsWith(".d.ts")),
    (file) => {
      const target = path.join(generated, file);

      return pipe(
        fs.makeDirectory(path.dirname(target), { recursive: true }),
        Effect.andThen(fs.copyFile(path.join(dist, file), target)),
      );
    },
    { discard: true },
  );

  // A declaration map names its sources relative to itself. Each copy names them from the repository's root. A link to a source file starts there, so a copy means the same in any directory.
  yield* Effect.forEach(
    Array.filter(files, (file) => file.endsWith(".d.ts.map")),
    (file) => {
      const from = path.dirname(path.join(dist, file));

      return pipe(
        path.join(dist, file),
        fs.readFileString,
        Effect.flatMap(Schema.decodeEffect(DeclarationMap)),
        Effect.map((map) => ({
          ...map,
          sourceRoot: "",
          sources: Array.map(map.sources, (source) =>
            path.relative(
              repository,
              path.resolve(from, map.sourceRoot, source),
            ),
          ),
        })),
        Effect.flatMap(Schema.encodeEffect(DeclarationMap)),
        Effect.flatMap((text) =>
          fs.writeFileString(path.join(generated, file), text),
        ),
      );
    },
    { discard: true },
  );

  const { name, exports } = yield* pipe(
    path.join(sdk, "package.json"),
    fs.readFileString,
    Effect.flatMap(Schema.decodeEffect(PackageJson)),
  );

  yield* pipe(
    Object.entries(exports),
    // The specifier an import names, such as `@local/hashql/Draft` for the key `./Draft`, which is also how a TSDoc declaration reference names the entrypoint.
    Array.map(
      ([key, { types }]) =>
        [
          `${name}${key.slice(1)}`,
          path.relative(dist, path.join(sdk, types)),
        ] as const,
    ),
    Array.sortWith(([entrypoint]) => entrypoint, Order.String),
    Schema.encodeEffect(Roots),
    Effect.flatMap((text) =>
      fs.writeFileString(path.join(generated, "exports.json"), text),
    ),
  );

  // The tags and HTML elements the SDK's doc comments may use, which the extraction parses them with.
  yield* fs.copyFile(
    path.join(sdk, "tsdoc.json"),
    path.join(generated, "tsdoc.json"),
  );
});

const main = copy.pipe(
  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- this is the script's entry point
  Effect.provide(NodeServices.layer),
);

// oxlint-disable-next-line vitest/require-hook -- This command starts a runtime rather than registering test setup.
NodeRuntime.runMain(main);
