// oxlint-disable effecttsgo/unstable-api-usage -- CLI module is unstable
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import { Data, Effect, FileSystem, Path } from "effect";
import { Command, Flag } from "effect/cli";

import type { IConfigFile } from "@microsoft/api-extractor";

const makeExtractorConfig = ({
  lib,
  entry,
  out,
}: {
  lib: string;
  entry: string;
  out: string;
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
    apiJsonFilePath: `${out}/api.json`,
  },
  dtsRollup: {
    enabled: false,
  },
  tsdocMetadata: {
    enabled: false,
  },
});

/** API Extractor finished the analysis and reported errors. */
export class ExtractionError extends Data.TaggedError("ExtractionError")<{
  readonly errorCount: number;
  readonly warningCount: number;
}> {}

export const command = Command.make("analyze", {
  lib: Flag.Directory("lib"),
  include: Flag.File("include", { mustExist: true }).pipe(Flag.atLeast(1)),
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

export const handler = command.pipe(
  Command.withHandler(
    Effect.fnUntraced(function* ({ lib, include, out }) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const libPath = path.resolve(lib);
      const outPath = path.resolve(out);
      const entryPath = path.join(outPath, "api-entry.d.ts");

      // API Extractor analyzes one entry point, so the included declaration files are re-exported from one generated module.
      const entry = include
        .map((file) => {
          const specifier = path
            .relative(outPath, path.resolve(file))
            .replace(/\.d\.(?<format>[cm]?)ts$/u, ".$<format>js");

          if (specifier.startsWith("../")) {
            return `export * from ${JSON.stringify(specifier)};\n`;
          }

          return `export * from ${JSON.stringify(`./${specifier}`)};\n`;
        })
        .join("");

      yield* fs.makeDirectory(outPath, { recursive: true });
      yield* fs.writeFileString(entryPath, entry);

      // Reads `<projectFolder>/tsdoc.json`, and throws when that or any configured path is invalid.
      const extractorConfig = yield* Effect.try(() =>
        ExtractorConfig.prepare({
          configObject: makeExtractorConfig({
            lib: libPath,
            entry: entryPath,
            out: outPath,
          }),
          configObjectFullPath: undefined,
          packageJsonFullPath: path.join(libPath, "package.json"),
        }),
      );

      const result = yield* Effect.try(() =>
        Extractor.invoke(extractorConfig, { localBuild: true }),
      );

      if (!result.succeeded) {
        return yield* new ExtractionError({
          errorCount: result.errorCount,
          warningCount: result.warningCount,
        });
      }

      return "Ok";
    }),
  ),
);
