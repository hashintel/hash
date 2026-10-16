import { ApiDeclaredItem, ApiModel } from "@microsoft/api-extractor-model";
import { TSDocConfiguration, TSDocParser } from "@microsoft/tsdoc";
import { TSDocConfigFile } from "@microsoft/tsdoc-config";
import {
  Array,
  Cache,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  Struct,
  flow,
  pipe,
} from "effect";

import { Sources } from "./Sources.js";
import { TransformError } from "./TransformError.js";

import type { ApiEntryPoint, ApiItem } from "@microsoft/api-extractor-model";
import type { DocComment } from "@microsoft/tsdoc";

/** The part of a declaration map that names the source TypeScript emitted the file from. */
const DeclarationMap = Schema.fromJsonString(
  Schema.Struct({
    sources: Schema.NonEmptyArray(Schema.String),
    sourceRoot: Schema.optionalKey(Schema.String),
  }),
);

// TypeScript's declaration emit renames each source extension this way.
const declarationExtensions: readonly (readonly [string, string])[] = [
  [".d.ts", ".d.ts"],
  [".mts", ".d.mts"],
  [".cts", ".d.cts"],
  [".tsx", ".d.ts"],
  [".ts", ".d.ts"],
];

/** A subpath that a package's `exports` names: `.` for the package itself, otherwise `./` followed by a path. A pattern with `*` names no single entry point. */
export const Subpath = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\.(?:\/[^/*]+)*$/u)),
);

/** The file `analyze` writes beside the models, which names each entry point it analyzed. */
export const manifestFile = "entry-points.json";

/** The entry points `analyze` analyzed, in the order it received them. Paths are relative to the manifest's directory. */
export const Manifest = Schema.fromJsonString(
  Schema.NonEmptyArray(
    Schema.Struct({
      subpath: Subpath,
      /** API Extractor's model of the entry point. */
      model: Schema.String,
      /** The declaration file the model was extracted from. */
      declaration: Schema.String,
    }),
  ),
  { space: 2 },
);

/** An entry point of the analyzed package. */
export interface EntryPoint {
  /** The subpath the package exports it at. */
  readonly subpath: string;
  /** API Extractor's model of the entry point, whose members are its exports. */
  readonly model: ApiEntryPoint;
  /** The source module TypeScript emitted the entry point's declaration file from. */
  readonly module: string;
}

/** The output of the `analyze` command, with what the pages need to find their way back to the sources. */
export class Analysis extends Context.Service<
  Analysis,
  {
    /** The analyzed package's name. */
    readonly name: string;
    /** The package's entry points, in the order `analyze` received them. */
    readonly entryPoints: Array.NonEmptyReadonlyArray<EntryPoint>;
    /** The directory TypeScript emitted the declaration files into. The first entry point's file sits at its top, and the tree below mirrors the sources. */
    readonly declarationRoot: string;
    /** The source file that declares an item. */
    readonly sourceOf: (item: ApiItem) => Option.Option<string>;
    /** The declaration file emitted from a source module. */
    readonly declarationOf: (
      source: string,
    ) => Effect.Effect<string, TransformError>;
    /** Parses a module's first JSDoc comment that carries `@module`, with the TSDoc configuration the analysis used. */
    readonly moduleComment: (
      source: string,
    ) => Effect.Effect<Option.Option<DocComment>, TransformError>;
  }
>()("@local/hashql-typescript-docs/Analysis") {}

export interface Options {
  /** The analyzed package's folder, which the model's file paths are relative to. */
  readonly lib: string;
  /** The directory `analyze` wrote. */
  readonly analysis: string;
}

const loadModel = Effect.fnUntraced(function* (file: string) {
  const apiPackage = yield* Effect.try(() =>
    new ApiModel().loadPackage(file),
  ).pipe(
    Effect.mapError((cause) => TransformError.unreadableModel(file, cause)),
  );

  const entry = yield* pipe(
    Array.head(apiPackage.entryPoints),
    Effect.fromOption,
    Effect.mapError(() =>
      TransformError.malformedAnalysis(`${file} has no entry point`),
    ),
  );

  return { apiPackage, entry };
});

// API Extractor reads `<projectFolder>/tsdoc.json`, so comments outside the model parse with the same tags.
const loadParser = Effect.fnUntraced(function* (lib: string) {
  const configFile = TSDocConfigFile.loadForFolder(lib);

  if (configFile.hasErrors) {
    return yield* TransformError.malformedAnalysis(
      configFile.getErrorSummary(),
    );
  }

  const configuration = new TSDocConfiguration();
  configFile.configureParser(configuration);

  return new TSDocParser(configuration);
});

const sourceOfDeclaration = Effect.fnUntraced(
  function* (declaration: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const mapPath = `${declaration}.map`;
    const text = yield* fs.readFileString(mapPath);

    const map = yield* Schema.decodeEffect(DeclarationMap)(text).pipe(
      Effect.mapError((cause) =>
        TransformError.malformedSourceMap(mapPath, cause),
      ),
    );

    return path.resolve(
      path.dirname(mapPath),
      map.sourceRoot ?? "",
      map.sources[0],
    );
  },
  Effect.catchTag("PlatformError", TransformError.fileSystem),
);

const loadManifest = Effect.fnUntraced(
  function* (analysis: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const file = path.join(analysis, manifestFile);
    const text = yield* fs.readFileString(file);

    const manifest = yield* Schema.decodeEffect(Manifest)(text).pipe(
      Effect.mapError((cause) => TransformError.malformedManifest(file, cause)),
    );

    return Array.map(manifest, ({ subpath, model, declaration }) => ({
      subpath,
      model: path.resolve(analysis, model),
      declaration: path.resolve(analysis, declaration),
    }));
  },
  Effect.catchTag("PlatformError", TransformError.fileSystem),
);

export const layer = ({
  lib,
  analysis,
}: Options): Layer.Layer<
  Analysis,
  TransformError,
  FileSystem.FileSystem | Path.Path | Sources
> =>
  Layer.effect(
    Analysis,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const sources = yield* Sources;
      const services = yield* Effect.context<
        FileSystem.FileSystem | Path.Path
      >();

      const parser = yield* loadParser(lib);
      const manifest = yield* loadManifest(analysis);
      const loaded = yield* Effect.forEach(
        manifest,
        Effect.fnUntraced(function* ({ subpath, model, declaration }) {
          const { apiPackage, entry } = yield* loadModel(model);
          const source = yield* sourceOfDeclaration(declaration);

          return {
            name: apiPackage.name,
            declaration,
            entryPoint: {
              subpath,
              model: entry,
              module: source,
            } satisfies EntryPoint,
          };
        }),
      );
      const first = Array.headNonEmpty(loaded);
      const rootSource = first.entryPoint.module;
      const declarationRoot = path.dirname(first.declaration);

      // The emit mirrors the source tree, so the first entry point locates every other declaration file, and each one's map confirms it.
      const declarations = yield* Cache.make({
        capacity: Number.POSITIVE_INFINITY,
        lookup: Effect.fnUntraced(function* (source: string) {
          const relative = path.relative(path.dirname(rootSource), source);
          const [extension, emitted] = Array.findFirst(
            declarationExtensions,
            ([candidate]) => relative.endsWith(candidate),
          ).pipe(Option.getOrElse(() => ["", ".d.ts"] as const));

          const declaration = path.join(
            declarationRoot,
            `${relative.slice(0, relative.length - extension.length)}${emitted}`,
          );

          const declSource = yield* sourceOfDeclaration(declaration);
          if (declSource !== source) {
            return yield* TransformError.malformedAnalysis(
              `${declaration} was not emitted from ${source}`,
            );
          }

          return declaration;
        }, Effect.provide(services)),
      });

      return Analysis.of({
        name: first.name,
        entryPoints: Array.map(loaded, Struct.get("entryPoint")),
        declarationRoot,
        sourceOf: (item) => {
          if (item instanceof ApiDeclaredItem) {
            return Option.fromNullishOr(item.fileUrlPath).pipe(
              Option.map((file) => path.resolve(lib, file)),
            );
          }

          return Option.none();
        },
        declarationOf: (source) => Cache.get(declarations, source),
        moduleComment: (source) =>
          sources.scope(source).pipe(
            Effect.map(({ comments, text }) =>
              Array.findFirst(
                comments,
                flow(
                  Option.liftPredicate(({ value }) => value.startsWith("*")),
                  Option.map(
                    ({ start, end }) =>
                      parser.parseString(text.slice(start, end)).docComment,
                  ),
                  Option.filter((parsed) =>
                    parsed.modifierTagSet.hasTagName("@module"),
                  ),
                ),
              ),
            ),
          ),
      });
    }),
  );
