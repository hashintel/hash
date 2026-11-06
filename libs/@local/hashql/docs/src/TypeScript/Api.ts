import {
  Array,
  Cause,
  Context,
  Effect,
  HashMap,
  Layer,
  Option,
  Record,
  pipe,
} from "effect";
import { API, ModuleKind, ModuleResolutionKind } from "typescript/async";
import { createFileSystemLayer } from "typescript/fs";

import type { Scope } from "effect";
import type { Node, SourceFile } from "typescript/ast";
import type {
  Snapshot as $Snapshot,
  Program,
  Project,
  RawCompilerOptions,
  SyntheticProjectId,
} from "typescript/async";

/** What a program reads besides the files on disk. */
export interface Options {
  /** The files each module specifier resolves to, as the compiler option `paths` maps them. */
  readonly paths: Record.ReadonlyRecord<string, readonly string[]>;
  /** Files the program reads from memory, by path, in place of whatever the disk holds there. */
  readonly files: HashMap.HashMap<string, string>;
}

/** A program in the snapshot that holds it. */
export interface Snapshot {
  /** The program's project, with its checker. */
  readonly project: Project;
  /**
   * The program with `files` added to its roots, closed with the calling scope.
   *
   * The new snapshot is built on this one, so a file both programs hold keeps its nodes and a symbol both hold keeps its id.
   */
  readonly extend: (
    files: HashMap.HashMap<string, string>,
  ) => Effect.Effect<Snapshot, Cause.UnknownError, Scope.Scope>;
}

/** `program` in `snapshot`, whose roots are `roots`, compiled with `options`. */
export const snapshot = ({
  snapshot: current,
  program,
  roots,
  options,
}: {
  readonly snapshot: $Snapshot;
  readonly program: Program<SyntheticProjectId>;
  readonly roots: readonly string[];
  readonly options: RawCompilerOptions;
}): Snapshot => ({
  project: program.getProject(),
  extend: (files) => {
    const extended = Array.appendAll(roots, HashMap.keys(files));

    return Effect.tryPromise(() =>
      current.update({
        fileSystem: createFileSystemLayer(Array.fromIterable(files)),
        reconfigurePrograms: [
          { id: program.id, rootFiles: extended, compilerOptions: options },
        ],
      }),
    ).pipe(
      Effect.acquireDisposable,
      Effect.flatMap((next) =>
        pipe(
          Option.fromUndefinedOr(next.getProgram(program.id)),
          Option.map((updated) =>
            snapshot({
              snapshot: next,
              program: updated,
              roots: extended,
              options,
            }),
          ),
          Effect.fromOption(
            () =>
              new Cause.UnknownError(
                undefined,
                `The updated snapshot has no program ${program.id}`,
              ),
          ),
        ),
      ),
    );
  },
});

/** The compiler's API process, which builds programs and answers questions about them. */
export class Api extends Context.Service<
  Api,
  {
    /** A program over the files `roots`, closed with its scope. */
    readonly createProgram: (
      roots: readonly string[],
      options: Options,
    ) => Effect.Effect<Snapshot, Cause.UnknownError, Scope.Scope>;
    /** Parses temporary syntax and retains its compiler resource until the calling scope closes. */
    readonly parse: (
      text: string,
    ) => Effect.Effect<SourceFile, Cause.UnknownError, Scope.Scope>;
    /** `node` as source text. */
    readonly print: (node: Node) => Effect.Effect<string, Cause.UnknownError>;
  }
>()("@local/hashql-docs/TypeScript/Api") {}

/** Starts the API process, and stops it when the layer's scope closes. */
export const layer: Layer.Layer<Api, Cause.UnknownError> = Effect.gen(
  function* () {
    const api = yield* Effect.try(() => new API()).pipe(
      Effect.acquireDisposable,
    );

    return Api.of({
      parse: (text) =>
        Effect.tryPromise(() =>
          api.createSourceFile("/hashql-docs/printed.d.ts", text),
        ).pipe(
          Effect.acquireDisposable,
          Effect.map(({ sourceFile }) => sourceFile),
        ),
      print: (node) => Effect.tryPromise(() => api.printer.printNode(node)),
      // A program lives in the snapshot that creates it, and the snapshot reads the files in memory before the disk.
      createProgram: (roots, { paths, files }) => {
        const options: RawCompilerOptions = {
          module: ModuleKind.NodeNext,
          moduleResolution: ModuleResolutionKind.NodeNext,
          noEmit: true,
          skipLibCheck: true,
          types: ["node"],
          paths: Record.map(paths, (targets) => Array.copy(targets)),
        };

        return Effect.tryPromise(() =>
          api.createSnapshot({
            fileSystem: createFileSystemLayer(Array.fromIterable(files)),
            createPrograms: [{ rootFiles: roots, compilerOptions: options }],
          }),
        ).pipe(
          Effect.acquireDisposable,
          Effect.map((created) =>
            snapshot({
              snapshot: created,
              program: created.operation.createdPrograms[0],
              roots,
              options,
            }),
          ),
        );
      },
    });
  },
).pipe(Layer.effect(Api));
