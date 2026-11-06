import {
  Array,
  Effect,
  HashMap,
  HashSet,
  Layer,
  Option,
  Path,
  pipe,
} from "effect";

import * as AST from "../AST/index.js";
import * as QuickInfo from "../QuickInfo.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Heritage from "./ast-heritage.js";
import * as Names from "./ast-names.js";

import type { Cause, Scope } from "effect";

const languages = HashSet.make("ts", "typescript", "tsx");

interface Compiled {
  readonly example: AST.Documentation.Example.Example;
  readonly file: string;
}

/** Every TypeScript example of the AST, each at a file of its own beside the file its comment is in, so a relative import in it means what its author meant. */
const examplesOf = (
  ast: AST.Store["Service"],
  path: Path.Path,
): readonly Compiled[] =>
  pipe(
    Array.fromIterable(ast.nodes()),
    Array.filter(AST.Documentation.isDocumentation),
    Array.flatMap((documentation) =>
      pipe(
        documentation.examples,
        Array.filter((example) => HashSet.has(languages, example.language)),
        Array.map((example) => ({
          example,
          directory: path.dirname(documentation.node.getSourceFile().fileName),
        })),
      ),
    ),
    Array.map(({ example, directory }, index) => ({
      example,
      file: path.join(
        directory,
        `example-${index}.${example.language === "tsx" ? "tsx" : "ts"}`,
      ),
    })),
  );

/** Records the source file `example` was compiled as, and what each name in it refers to, with what an editor shows on hover over it. */
const compile = Effect.fnUntraced(function* ({ example, file }: Compiled) {
  const program = yield* TypeScript.Program.Program;
  const checker = yield* TypeScript.Checker.Checker;
  const store = yield* AST.Store;
  const source = yield* program.sourceFile(file);

  if (Option.isNone(source)) {
    return yield* AST.ParseError.missingSource({ file });
  }

  store.program(example, source.value);
  const names = TypeScript.Node.identifiers(source.value);
  const symbols = yield* checker.getSymbolAtLocation(names);

  for (const [name, found] of Array.zip(names, symbols)) {
    if (Option.isSome(found)) {
      const symbol = yield* TypeScript.Checker.resolveAlias(found.value);

      // A name that resolves to nothing, such as an import the program cannot find, has no meaning to show.
      const isUnknown = yield* checker.isUnknownSymbol(symbol);
      if (!isUnknown) {
        // The AST already holds every name the package declares, so a name it does not hold is outside the package, the example's own included.
        const target = yield* store.internedSymbol(symbol).pipe(
          Option.match({
            onSome: Effect.succeed,
            onNone: () => Names.external(symbol),
          }),
        );

        store.name(name, {
          target,
          quickInfo: yield* QuickInfo.of(name, found.value),
        });
      }
    }
  }
});

/**
 * Compiles every TypeScript example of the AST in one more snapshot of the program, and records what each name in it refers to.
 *
 * The program keeps its files and symbols, so a name an example imports from the package refers to the node of the AST that declares it. A name the example declares itself is outside the AST. Example code is neither run nor checked for diagnostics, and the program with the examples stays open with the calling scope, because printing their quick info reads its types.
 */
export const resolve = Effect.fnUntraced(function* (): Effect.fn.Return<
  void,
  AST.ParseError.ParseError | Cause.UnknownError,
  AST.Store | Path.Path | Scope.Scope | TypeScript.Program.Program
> {
  const store = yield* AST.Store;
  const path = yield* Path.Path;
  const examples = examplesOf(store, path);

  if (examples.length === 0) {
    return;
  }

  const compiler = yield* TypeScript.Program.extend(
    HashMap.fromIterable(
      Array.map(examples, ({ example, file }) => [file, example.code] as const),
    ),
  );

  // The parse built this layer over its own program, and Effect shares a layer it has built once, so this phase builds it again over the examples' program. The parse's checker refuses a symbol of the examples' program.
  const services = Layer.fresh(Heritage.layer).pipe(
    Layer.provideMerge(Layer.succeedContext(compiler)),
  );

  yield* Effect.forEach(examples, compile, { discard: true }).pipe(
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- These services serve the examples' program alone, and close with this phase.
    Effect.provide(services),
  );
});
