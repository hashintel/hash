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
  Result,
  Schema,
  Struct,
  flow,
  pipe,
} from "effect";

import { Sources } from "./Sources.js";
import { TransformError } from "./TransformError.js";

import type {
  ApiEntryPoint,
  ApiItem,
  ApiPackage,
} from "@microsoft/api-extractor-model";
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

/** The output of the `analyze` command, with what the pages need to find their way back to the sources. */
export class Analysis extends Context.Service<
  Analysis,
  {
    readonly package: ApiPackage;
    readonly entry: ApiEntryPoint;
    /** The source modules of the declaration files the analysis entry re-exports, in order. */
    readonly roots: Array.NonEmptyReadonlyArray<string>;
    /** The directory TypeScript emitted the declaration files into. The first root's file sits at its top, and the tree below mirrors the sources. */
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

const loadEntry = Effect.fnUntraced(function* (file: string) {
  const apiPackage = yield* Effect.try(() =>
    new ApiModel().loadPackage(file),
  ).pipe(
    Effect.mapError((cause) => TransformError.unreadableModel(file, cause)),
  );

  const entry = yield* pipe(
    Array.head(apiPackage.entryPoints),
    Effect.fromOption,
    Effect.mapError(() =>
      TransformError.malformedAnalysis("The API model has no entry point"),
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

// `analyze` writes one `export * from` for each declaration file it receives, and each file's map names its source.
const loadRoots = Effect.fnUntraced(function* (entryFile: string) {
  const sources = yield* Sources;
  const declarations = yield* pipe(
    sources.scope(entryFile),
    Effect.map(Struct.get("wildcards")),
    Effect.flatMap(
      flow(
        Array.map((specifier) =>
          sources
            .resolve(entryFile, specifier)
            .pipe(
              Result.fromOption(() =>
                TransformError.malformedAnalysis(
                  `${entryFile} re-exports ${specifier}, which does not exist`,
                ),
              ),
            ),
        ),
        Result.all,
        Effect.fromResult,
      ),
    ),
  );

  if (!Array.isReadonlyArrayNonEmpty(declarations)) {
    return yield* TransformError.malformedAnalysis(
      `${entryFile} re-exports no declaration file`,
    );
  }

  return {
    declaration: Array.headNonEmpty(declarations),
    sources: yield* Effect.forEach(declarations, sourceOfDeclaration),
  };
});

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

      const { apiPackage, entry } = yield* loadEntry(
        path.join(analysis, "api.json"),
      );
      const parser = yield* loadParser(lib);
      const roots = yield* loadRoots(path.join(analysis, "api-entry.d.ts"));
      const rootSource = Array.headNonEmpty(roots.sources);
      const declarationRoot = path.dirname(roots.declaration);

      // The emit mirrors the source tree, so the first root locates every other declaration file, and each one's map confirms it.
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
        package: apiPackage,
        entry,
        roots: roots.sources,
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
