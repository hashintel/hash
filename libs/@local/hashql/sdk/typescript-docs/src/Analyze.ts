// oxlint-disable effecttsgo/unstable-api-usage -- CLI module is unstable
import {
  Extractor,
  ExtractorConfig,
  ExtractorLogLevel,
} from "@microsoft/api-extractor";
import {
  Array,
  Data,
  Effect,
  FileSystem,
  Option,
  Path,
  Record,
  Schema,
  flow,
} from "effect";
import { Command, Flag } from "effect/cli";

import * as Analysis from "./Analysis.js";

import type { IConfigFile } from "@microsoft/api-extractor";

const makeExtractorConfig = ({
  lib,
  entry,
  model,
}: {
  lib: string;
  entry: string;
  model: string;
}): IConfigFile => ({
  projectFolder: lib,
  mainEntryPointFilePath: entry,
  compiler: {
    tsconfigFilePath: "<projectFolder>/tsconfig.json",
  },
  apiReport: {
    enabled: false,
  },
  docModel: {
    enabled: true,
    apiJsonFilePath: model,
  },
  dtsRollup: {
    enabled: false,
  },
  tsdocMetadata: {
    enabled: false,
  },
  // `prepare` merges no defaults into a config object, which means we need to supply it manually
  messages: {
    compilerMessageReporting: {
      default: { logLevel: ExtractorLogLevel.Warning },
    },
    extractorMessageReporting: {
      default: { logLevel: ExtractorLogLevel.Warning },
      "ae-undocumented": { logLevel: ExtractorLogLevel.None },
      "ae-wrong-input-file-type": { logLevel: ExtractorLogLevel.Error },
    },
    tsdocMessageReporting: {
      default: { logLevel: ExtractorLogLevel.Warning },
    },
  },
});

/** API Extractor finished analyzing an entry point and reported errors. */
export class ExtractionError extends Data.TaggedError("ExtractionError")<{
  readonly subpath: string;
  readonly errorCount: number;
  readonly warningCount: number;
}> {}

export const command = Command.make("analyze", {
  lib: Flag.Directory("lib"),
  entry: Flag.KeyValuePair("entry").pipe(
    Flag.withDescription(
      "An export subpath and the declaration file TypeScript emitted for it, such as `./draft=<file>`. The first entry's file sits at the top of the emit",
    ),
    // `KeyValuePair` requires a pair, though its type does not say so.
    Flag.filterMap(
      flow(Record.toEntries, Option.liftPredicate(Array.isArrayNonEmpty)),
      () => "Expected at least one entry point",
    ),
    Flag.withSchema(
      Schema.NonEmptyArray(Schema.Tuple([Analysis.Subpath, Schema.String])),
    ),
  ),
  out: Flag.Directory("out").pipe(
    Flag.withDefault(
      Effect.suspend(() =>
        Path.Path.pipe(
          Effect.map((path) =>
            path.resolve(import.meta.dirname, "..", ".generated"),
          ),
        ),
      ),
    ),
  ),
});

// API Extractor analyzes a single entry point per run, and merging several into one module would collide where two of them export the same name.
const extract = Effect.fnUntraced(function* ({
  lib,
  subpath,
  entry,
  model,
}: {
  lib: string;
  subpath: string;
  entry: string;
  model: string;
}) {
  const path = yield* Path.Path;

  // May throw when `<projectFolder>/tsdoc.json` is invalid, or when the entry is not a declaration file that exists.
  const extractorConfig = yield* Effect.try(() =>
    ExtractorConfig.prepare({
      configObject: makeExtractorConfig({ lib, entry, model }),
      configObjectFullPath: undefined,
      packageJsonFullPath: path.join(lib, "package.json"),
    }),
  );

  return yield* Effect.try(() =>
    Extractor.invoke(extractorConfig, { localBuild: true }),
  ).pipe(
    Effect.filterOrFail(
      ({ succeeded }) => succeeded,
      ({ errorCount, warningCount }) =>
        new ExtractionError({ subpath, errorCount, warningCount }),
    ),
  );
});

export const handler = command.pipe(
  Command.withHandler(
    Effect.fnUntraced(function* ({ lib, entry, out }) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const libPath = path.resolve(lib);
      const outPath = path.resolve(out);

      yield* fs.makeDirectory(outPath, { recursive: true });

      const entryPoints = yield* Effect.forEach(
        entry,
        Effect.fnUntraced(function* ([subpath, file], index) {
          const declaration = path.resolve(file);
          const model = path.join(outPath, "api", `${index}.json`);

          yield* extract({ lib: libPath, subpath, entry: declaration, model });

          return {
            subpath,
            model: path.relative(outPath, model),
            declaration: path.relative(outPath, declaration),
          };
        }),
      );

      const manifest = yield* Schema.encodeEffect(Analysis.Manifest)(
        entryPoints,
      );
      yield* fs.writeFileString(
        path.join(outPath, Analysis.manifestFile),
        manifest,
      );

      return "Ok";
    }),
  ),
);
