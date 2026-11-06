import { fileURLToPath } from "node:url";

import { NodeFileSystem } from "@effect/platform-node";
import { Array, Effect, FileSystem, Option, Record } from "effect";
import { API, ModuleKind, ModuleResolutionKind } from "typescript/async";
import { createFileSystemLayer } from "typescript/fs";

import * as Api from "../../src/TypeScript/Api.js";

import type { SourceFile } from "typescript/ast";
import type {
  Symbol as CompilerSymbol,
  Project,
  RawCompilerOptions,
} from "typescript/async";

interface Fixture {
  readonly file: string;
  readonly api: API;
  readonly project: Project;
  /** The fixture's program in its snapshot, which can take more roots. */
  readonly snapshot: Api.Snapshot;
  readonly source: SourceFile;
  readonly exported: (name: string) => CompilerSymbol;
}

export interface Options {
  readonly source?: string;
  readonly files?: Record.ReadonlyRecord<string, string>;
}

/** Opens declaration fixtures as a module without loading the repository\'s projects. */
export const open = async (options: Options = {}): Promise<Fixture> => {
  const file = fileURLToPath(new URL("declarations.d.ts", import.meta.url));
  const readText = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(
      fileURLToPath(new URL("declarations.d.ts.txt", import.meta.url)),
    );
  });
  const text =
    options.source ??
    (await readText.pipe(
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This fixture entry point finishes the read before returning any compiler resources.
      Effect.provide(NodeFileSystem.layer),
      Effect.runPromise,
    ));
  const files = Array.map(
    Record.toEntries(options.files ?? {}),
    ([name, contents]) =>
      [fileURLToPath(new URL(name, import.meta.url)), contents] as const,
  );
  const api = new API();
  const compilerOptions: RawCompilerOptions = {
    module: ModuleKind.NodeNext,
    moduleResolution: ModuleResolutionKind.NodeNext,
    types: [],
    noLib: true,
    noEmit: true,
  };
  try {
    const snapshot = await api.createSnapshot({
      fileSystem: createFileSystemLayer([[file, text], ...files]),
      createPrograms: [{ rootFiles: [file], compilerOptions }],
    });
    const [program] = snapshot.operation.createdPrograms;
    const project = program.getProject();
    const source = await project.program.getSourceFile(file);
    const root = await project.checker.getSymbolOfSourceFile(file);
    if (source === undefined || root === undefined) {
      throw new Error("Fixture has no module source or symbol");
    }
    const exports = await project.checker.getExportsOfModule(root);
    return {
      file,
      api,
      project,
      snapshot: Api.snapshot({
        snapshot,
        program,
        roots: [file],
        options: compilerOptions,
      }),
      source,
      exported: (name) =>
        Array.findFirst(exports, (symbol) => symbol.name === name).pipe(
          Option.getOrThrow,
        ),
    };
  } catch (error) {
    await api.close();
    throw error;
  }
};
