import {
  Array,
  Effect,
  FileSystem,
  HashMap,
  Option,
  Path,
  Record,
  Schema,
  pipe,
} from "effect";

import * as AST from "./AST/index.js";
import * as DocumentationParser from "./DocumentationParser.js";
import * as Parser from "./Parser.js";
import * as TypeScript from "./TypeScript/index.js";

export interface Options {
  /** The directory that holds the declarations, with their `exports.json` manifest of entrypoints and the package's `tsdoc.json`. */
  readonly directory: string;
}

const Roots = Schema.fromJsonString(
  Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
);

/** The AST of every entrypoint, each read from its file in the program. */
const parse = Effect.fnUntraced(function* (
  roots: readonly (readonly [name: string, file: string])[],
) {
  const program = yield* TypeScript.Program.Program;
  const modules = yield* Effect.forEach(
    roots,
    Effect.fnUntraced(function* ([name, file]) {
      const source = Option.filter(
        yield* program.sourceFile(file),
        TypeScript.Module.isModule,
      );

      if (Option.isNone(source)) {
        return yield* AST.ParseError.missingModule({ file });
      }

      return [name, source.value] as const;
    }),
  );

  return yield* Parser.parse(modules);
});

/** The catalogue of public names the declarations in a directory export. */
export const fromDirectory = Effect.fnUntraced(function* (options: Options) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const roots = yield* pipe(
    path.join(options.directory, "exports.json"),
    fs.readFileString,
    Effect.flatMap(Schema.decodeEffect(Roots)),
    Effect.map(
      Array.map(
        ([name, file]) =>
          [name, path.resolve(options.directory, file)] as const,
      ),
    ),
  );
  const documentation = yield* DocumentationParser.fromFile(
    path.join(options.directory, "tsdoc.json"),
  );
  const program = TypeScript.Program.layer(
    Array.map(roots, ([, file]) => file),
    {
      paths: Record.fromEntries(
        Array.map(roots, ([name, file]) => [name, [file]] as const),
      ),
      files: HashMap.empty(),
    },
  );

  return yield* parse(roots).pipe(
    Effect.scoped,
    Effect.provideService(
      DocumentationParser.DocumentationParser,
      documentation,
    ),
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- The generation owns the program's lifetime, which ends once the catalogue is parsed.
    Effect.provide(program),
  );
});
