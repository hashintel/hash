import {
  Array,
  Effect,
  FileSystem,
  HashMap,
  Layer,
  Option,
  Path,
  Record,
  Schema,
  Struct,
  pipe,
} from "effect";

import * as AST from "./AST/index.js";
import * as Document from "./Document.js";
import * as DocumentationLinks from "./DocumentationLinks.js";
import * as DocumentationParser from "./DocumentationParser.js";
import * as Location from "./Location.js";
import * as Page from "./Page.js";
import * as Parser from "./Parser.js";
import * as TypeScript from "./TypeScript/index.js";

export interface Options extends Page.Options {
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

/**
 * The reference's pages for the declarations in a directory, with the catalogue of public names they document.
 *
 * The program stays open until every page is written, because printing reads the syntax the parser kept.
 */
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

  return yield* Effect.gen(function* () {
    const catalogue = yield* parse(roots);
    yield* Effect.fromResult(DocumentationLinks.check(catalogue));
    const document = yield* Effect.fromResult(Document.collect(catalogue));
    const pages = yield* Page.all(document, options);

    return Struct.assign(pages, { catalogue });
  }).pipe(
    Effect.scoped,
    Effect.provideService(
      DocumentationParser.DocumentationParser,
      documentation,
    ),
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- The generation owns the program's lifetime, which ends once every page is written.
    Effect.provide(Layer.merge(program, Location.layer(options.directory))),
  );
});
