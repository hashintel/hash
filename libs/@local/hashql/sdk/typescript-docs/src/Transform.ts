// oxlint-disable effecttsgo/unstable-api-usage -- CLI module is unstable
import {
  Array,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
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
  Effect.map(Path.Path, (path) =>
    path.resolve(import.meta.dirname, "..", ...segments),
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

// Fumadocs lists a directory's pages under its index page, so a page with namespace pages below it, the package page among them, is its directory's index.
const segmentsOf = (
  site: Site.Site["Service"],
  page: Site.Page,
): readonly string[] => {
  const isDirectory =
    Array.isReadonlyArrayEmpty(page.path) ||
    Array.some(page.container.members, (item) =>
      Option.isSome(site.pageOf(item)),
    );

  if (isDirectory) {
    return [...page.path, "index"];
  }

  return page.path;
};

const write = Effect.fnUntraced(
  function* (out: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const site = yield* Site.Site;

    // Encoding a literal of the schema's own type cannot fail.
    const meta = yield* Schema.encodeEffect(Meta)({
      title: "API reference",
      pages: ["index", "..."],
    }).pipe(Effect.orDie);

    yield* fs.remove(out, { recursive: true, force: true });
    const writeMdx = Effect.fnUntraced(function* (
      segments: readonly string[],
      content: string,
    ) {
      const file = `${path.join(out, ...segments)}.mdx`;

      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, content);
    });

    yield* Effect.forEach(site.pages, (page) =>
      pipe(
        Page.render(page),
        Effect.map(Mdx.stringify({ title: page.title })),
        Effect.flatMap((content) => writeMdx(segmentsOf(site, page), content)),
      ),
    );
    yield* fs.writeFileString(path.join(out, "meta.json"), meta);
    yield* Effect.log(`Wrote ${site.pages.length} pages to ${out}`);
  },
  Effect.catchTag("PlatformError", TransformError.fileSystem),
);

export const handler = command.pipe(
  Command.withHandler(({ out }) =>
    Effect.flatMap(Path.Path, (path) => write(path.resolve(out))),
  ),
  Command.provide(({ lib, analysis, url }) =>
    Site.layer({ url }).pipe(
      Layer.provideMerge(Analysis.layer({ lib, analysis })),
      Layer.provideMerge(Sources.layer),
    ),
  ),
);
