import { fileURLToPath } from "node:url";

import { NodeFileSystem } from "@effect/platform-node";
import {
  Array,
  Cause,
  Context,
  Effect,
  FileSystem,
  Function,
  Layer,
  Option,
  Record,
} from "effect";
import { API, ModuleKind, ModuleResolutionKind } from "typescript/async";
import { createFileSystemLayer } from "typescript/fs";

import * as Api from "../../src/TypeScript/Api.js";
import * as Checker from "../../src/TypeScript/Checker.js";
import * as Program from "../../src/TypeScript/Program.js";

import type { Scope } from "effect";
import type { Node, SourceFile } from "typescript/ast";
import type {
  Symbol as CompilerSymbol,
  Project,
  RawCompilerOptions,
} from "typescript/async";

/** Declaration fixtures compiled as one module. */
export class Fixture extends Context.Service<Fixture, Fixture.Shape>()(
  "@local/hashql-docs/tests/fixtures/compiler/Fixture",
) {}

export declare namespace Fixture {
  export interface Shape {
    readonly file: string;
    readonly api: API;
    readonly project: Project;
    /** The fixture's program in its snapshot, which can take more roots. */
    readonly snapshot: Api.Snapshot;
    readonly source: SourceFile;
    readonly exported: (name: string) => CompilerSymbol;
  }
}

export interface Options {
  readonly source?: string;
  readonly files?: Record.ReadonlyRecord<string, string>;
}

const read = Effect.flatMap(FileSystem.FileSystem, (fs) =>
  fs.readFileString(
    fileURLToPath(new URL("declarations.d.ts.txt", import.meta.url)),
  ),
);

/** Opens declaration fixtures as a module without loading the repository's projects, and stops the compiler when the calling scope closes. */
export const open = Effect.fnUntraced(function* (options: Options = {}) {
  const file = fileURLToPath(new URL("declarations.d.ts", import.meta.url));
  const text = options.source ?? (yield* read);
  const files = Array.map(
    Record.toEntries(options.files ?? {}),
    ([name, contents]) =>
      [fileURLToPath(new URL(name, import.meta.url)), contents] as const,
  );
  const api = yield* Effect.try(() => new API()).pipe(Effect.acquireDisposable);
  const compilerOptions: RawCompilerOptions = {
    module: ModuleKind.NodeNext,
    moduleResolution: ModuleResolutionKind.NodeNext,
    types: [],
    noLib: true,
    noEmit: true,
  };
  const snapshot = yield* Effect.tryPromise(() =>
    api.createSnapshot({
      fileSystem: createFileSystemLayer([[file, text], ...files]),
      createPrograms: [{ rootFiles: [file], compilerOptions }],
    }),
  );
  const [program] = snapshot.operation.createdPrograms;
  const project = program.getProject();
  const source = yield* Effect.tryPromise(() =>
    project.program.getSourceFile(file),
  );
  const root = yield* Effect.tryPromise(() =>
    project.checker.getSymbolOfSourceFile(file),
  );

  if (source === undefined || root === undefined) {
    return yield* new Cause.UnknownError(
      undefined,
      "Fixture has no module source or symbol",
    );
  }

  const exports = yield* Effect.tryPromise(() =>
    project.checker.getExportsOfModule(root),
  );

  return Fixture.of({
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
  });
});

/** The fixture with its program and checker, shared by the tests of one `layer` block. */
export const layer = (
  options?: Options,
): Layer.Layer<
  Fixture | Program.Program | Checker.Checker,
  Effect.Error<ReturnType<typeof open>>
> =>
  open(options).pipe(
    Effect.map((fixture) =>
      Context.make(Fixture, fixture).pipe(
        Context.add(Program.Program, Program.make(fixture.snapshot)),
        Context.add(
          Checker.Checker,
          Checker.make({ checker: fixture.project.checker }),
        ),
      ),
    ),
    Layer.effectContext,
    Layer.provide(NodeFileSystem.layer),
  );

/** `node` as source text. */
export const print = (
  node: Node,
): Effect.Effect<string, Cause.UnknownError, Fixture> =>
  Effect.flatMap(Fixture, ({ api }) =>
    Effect.tryPromise(() => api.printer.printNode(node)),
  );

/** `text` parsed as the declaration file `name` beside the fixture, which the compiler keeps until the calling scope closes. */
export const parse: {
  (
    name: string,
  ): (
    text: string,
  ) => Effect.Effect<SourceFile, Cause.UnknownError, Fixture | Scope.Scope>;
  (
    text: string,
    name: string,
  ): Effect.Effect<SourceFile, Cause.UnknownError, Fixture | Scope.Scope>;
} = Function.dual(2, (text: string, name: string) =>
  Effect.flatMap(Fixture, ({ api, file }) =>
    Effect.tryPromise(() =>
      api.createSourceFile(`${file}.${name}.d.ts`, text),
    ).pipe(
      Effect.acquireDisposable,
      Effect.map(({ sourceFile }) => sourceFile),
    ),
  ),
);
