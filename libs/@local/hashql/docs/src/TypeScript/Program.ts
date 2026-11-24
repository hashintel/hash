import { Array, Context, Effect, Function, Layer, Option, pipe } from "effect";
import { toRootedDirectoryPath } from "typescript/path";

import * as Api from "./Api.js";
import * as Checker from "./Checker.js";

import type { Cause, HashMap, Scope } from "effect";
import type { Declaration, Node, SourceFile } from "typescript/ast";
import type { Symbol as $Symbol, NodeHandle } from "typescript/async";

/** One program over files of the package, such as its declaration files. */
export class Program extends Context.Service<Program, Program.Shape>()(
  "@local/hashql-docs/TypeScript/Program",
) {}

export declare namespace Program {
  export interface Shape {
    /** The node a handle points at, or none when its file is not in the program's project. */
    readonly resolve: <T extends Node>(
      handle: NodeHandle<T>,
    ) => Effect.Effect<Option.Option<T>, Cause.UnknownError>;
    /** The nodes declaring `symbol` that the program's project holds. A declaration in a file outside it is left out. */
    readonly declarations: (
      symbol: $Symbol,
    ) => Effect.Effect<readonly Declaration[], Cause.UnknownError>;
    /** Whether `file` belongs to a dependency or to the standard library. Such a file lies outside the directory of the package's own files, or in a `node_modules` directory below it. */
    readonly isExternal: (file: SourceFile) => boolean;
    /** The source file at `file`, or none when the program does not hold it. */
    readonly sourceFile: (
      file: string,
    ) => Effect.Effect<Option.Option<SourceFile>, Cause.UnknownError>;
    /**
     * The program with `files` added to its roots, and its checker, closed with the calling scope.
     *
     * A file this program holds keeps its nodes there, and a symbol keeps its id, so what is known about them still applies.
     */
    readonly extend: (
      files: HashMap.HashMap<string, string>,
    ) => Effect.Effect<
      Context.Context<Program | Checker.Checker>,
      Cause.UnknownError,
      Scope.Scope
    >;
  }
}

/** The node a handle points at, or none when its file is not in the program's project. */
export const resolve = <T extends Node>(
  handle: NodeHandle<T>,
): Effect.Effect<Option.Option<T>, Cause.UnknownError, Program> =>
  Effect.flatMap(Program, (program) => program.resolve(handle));

/** The program with `files` added to its roots, and its checker, closed with the calling scope. */
export const extend = (
  files: HashMap.HashMap<string, string>,
): Effect.Effect<
  Context.Context<Program | Checker.Checker>,
  Cause.UnknownError,
  Program | Scope.Scope
> => Effect.flatMap(Program, (program) => program.extend(files));

/**
 * The service over a project's program.
 *
 * A program belongs to its project, so `layer` builds it together with the project's checker.
 *
 * @internal
 */
export const make = ({
  project,
  directory,
  extend: grow,
}: Api.Snapshot): Program["Service"] => {
  const resolveIn: Program.Shape["resolve"] = (handle) =>
    Effect.tryPromise(() => handle.resolve(project)).pipe(
      Effect.map(Option.fromUndefinedOr),
    );
  // The compiler names every file by a rooted path with forward slashes, and compares names as the file system does.
  const own = project.program.getCanonicalFileName(
    `${toRootedDirectoryPath(directory, project.program.getCurrentDirectory())}/`,
  );

  return Program.of({
    resolve: resolveIn,
    declarations: (symbol) =>
      pipe(
        symbol.declarations,
        Effect.forEach(resolveIn),
        Effect.map(Array.getSomes),
      ),
    isExternal: (file) => {
      const name = project.program.getCanonicalFileName(file.fileName);

      return (
        !name.startsWith(own) ||
        name.slice(own.length).split("/").includes("node_modules")
      );
    },
    sourceFile: (file) =>
      Effect.tryPromise(() => project.program.getSourceFile(file)).pipe(
        Effect.map(Option.fromUndefinedOr),
      ),
    // oxlint-disable-next-line eslint/no-use-before-define -- The program and its context build each other, and this runs after module initialisation.
    extend: (files) => Effect.map(grow(files), contextOf),
  });
};

/** The program of `snapshot` and its project's checker. */
const contextOf = (
  snapshot: Api.Snapshot,
): Context.Context<Program | Checker.Checker> =>
  Context.make(Program, make(snapshot)).pipe(
    Context.add(
      Checker.Checker,
      Checker.make({ checker: snapshot.project.checker }),
    ),
  );

/** A program over the files `roots`, and the checker of its project. */
export const layer: {
  (
    options: Api.Options,
  ): (
    roots: readonly string[],
  ) => Layer.Layer<Program | Checker.Checker, Cause.UnknownError, Api.Api>;
  (
    roots: readonly string[],
    options: Api.Options,
  ): Layer.Layer<Program | Checker.Checker, Cause.UnknownError, Api.Api>;
} = Function.dual(
  2,
  Effect.fnUntraced(function* (roots: readonly string[], options: Api.Options) {
    const api = yield* Api.Api;

    return contextOf(yield* api.createProgram(roots, options));
  }, Layer.effectContext),
);
