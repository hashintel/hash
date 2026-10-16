// oxlint-disable effecttsgo/unstable-api-usage -- CLI module is unstable
import {
  Array,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schema,
  identity,
  pipe,
} from "effect";
import { Command, Flag } from "effect/cli";

import * as Analysis from "./Analysis.js";
import * as Mdx from "./Mdx.js";
import * as Page from "./Page.js";
import * as Site from "./Site.js";
import * as Sources from "./Sources.js";
import { TransformError } from "./TransformError.js";

// The reference folder lists the package page first, then the module folders.
const Meta = Schema.fromJsonString(
  Schema.Struct({ title: Schema.String, pages: Schema.Array(Schema.String) }),
  { space: 2 },
);

const packageDirectory = (
  ...segments: string[]
): Effect.Effect<string, never, Path.Path> =>
  Effect.suspend(() =>
    Path.Path.pipe(
      Effect.map((path) =>
        path.resolve(import.meta.dirname, "..", ...segments),
      ),
    ),
  );

export const command = Command.make("transform", {
  lib: Flag.Directory("lib", { mustExist: true }).pipe(
    Flag.withDescription("The analyzed package's folder"),
  ),
  analysis: Flag.Directory("analysis", { mustExist: true }).pipe(
    Flag.withDescription("The directory `analyze` wrote"),
    Flag.withDefault(packageDirectory(".generated")),
  ),
  out: Flag.Directory("out").pipe(
    Flag.withDescription(
      "The directory the reference pages are written to; its previous contents are removed",
    ),
    Flag.withDefault(packageDirectory("content", "docs", "reference")),
  ),
  url: Flag.String("url").pipe(
    Flag.withDescription("The URL the package page is served at"),
    Flag.withDefault("/docs/reference"),
  ),
});

// The package page is the folder's index page.
const fileOf = (path: Path.Path, out: string, page: Site.Page): string =>
  `${path.join(
    out,
    ...Array.match(page.path, {
      onEmpty: () => ["index"],
      onNonEmpty: identity,
    }),
  )}.mdx`;

const write = Effect.fnUntraced(function* (out: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { pages } = yield* Site.Site;
  // Encoding a literal of the schema's own type cannot fail.
  const meta = yield* Schema.encodeEffect(Meta)({
    title: "API reference",
    pages: ["index", "..."],
  }).pipe(Effect.orDie);

  yield* fs
    .remove(out, { recursive: true, force: true })
    .pipe(Effect.mapError(TransformError.fileSystem));

  yield* pipe(
    pages,
    Effect.forEach((page) => {
      const file = fileOf(path, out, page);

      return Page.render(page).pipe(
        Effect.flatMap((tree) =>
          fs
            .makeDirectory(path.dirname(file), { recursive: true })
            .pipe(
              Effect.andThen(fs.writeFileString(file, Mdx.stringify(tree))),
              Effect.mapError(TransformError.fileSystem),
            ),
        ),
      );
    }),
  );

  yield* fs
    .writeFileString(path.join(out, "meta.json"), meta)
    .pipe(Effect.mapError(TransformError.fileSystem));
  yield* Effect.log(`Wrote ${pages.length} pages to ${out}`);
});

export const handler = command.pipe(
  Command.withHandler(({ out }) =>
    Path.Path.pipe(Effect.flatMap((path) => write(path.resolve(out)))),
  ),
  Command.provide(({ lib, analysis, url }) =>
    Site.layer({ url }).pipe(
      Layer.provideMerge(Analysis.layer({ lib, analysis })),
      Layer.provideMerge(Sources.layer),
    ),
  ),
);
