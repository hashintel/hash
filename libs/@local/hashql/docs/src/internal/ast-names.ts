import { Array, Context, Effect, Option, pipe } from "effect";
import * as Syntax from "typescript/ast";

import * as AST from "../AST/index.js";
import * as ExternalTarget from "../ExternalTarget.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Heritage from "./ast-heritage.js";
import * as DocSource from "./ast/doc-source.js";
import * as Source from "./ast/source.js";

import type { Failure } from "./ast-type-parser.js";
import type { Cause } from "effect";
import type { Symbol as CompilerSymbol } from "typescript/async";

/**
 * Gives a symbol its node where a name in a type meets it: the declaration around it when the package declares it, or else an item outside the package.
 *
 * Parsing a declaration parses its types, and the declaration parser that reaches a declaration depends on the type parser that needs this. The parse therefore provides it per parse, beside the store, rather than to the type parser's layer.
 *
 * @effect-leakable-service
 */
export class Reach extends Context.Service<Reach, Reach.Shape>()(
  "@local/hashql-docs/internal/ast-names/Reach",
) {}

export declare namespace Reach {
  export interface Shape {
    readonly reach: (
      symbol: CompilerSymbol,
    ) => Effect.Effect<AST.Target.InternedSymbol, Failure>;
  }
}

/** The statement of its module or namespace that `node` is part of, such as the interface around a member. */
const ownerOf = (node: Syntax.Node): Option.Option<Source.Definition> => {
  let owner: Option.Option<Source.Definition> = Option.none();
  let current = node;

  while (!Syntax.isSourceFile(current) && !Syntax.isModuleBlock(current)) {
    if (Source.isDefinition(current)) {
      owner = Option.some(current);
    }

    current = current.parent;
  }

  return owner;
};

/** The symbol `node` declares as a module or as a statement of one, or none for any other syntax. */
export const declaredBy = (
  node: Syntax.Node,
): Effect.Effect<
  Option.Option<CompilerSymbol>,
  Cause.UnknownError,
  TypeScript.Checker.Checker
> => {
  if (Syntax.isSourceFile(node)) {
    return TypeScript.Checker.getSymbolOfSourceFile(node.fileName);
  }

  if (Source.isDefinition(node)) {
    return Effect.asSome(TypeScript.Checker.getSymbolOfDeclaration(node));
  }

  return Effect.succeedNone;
};

/** The symbol `node` names, with an alias followed to what it names, or none for a name the compiler binds to nothing. */
export const symbolAt = Effect.fnUntraced(function* (
  node: Syntax.Node,
): Effect.fn.Return<
  Option.Option<CompilerSymbol>,
  Cause.UnknownError,
  TypeScript.Checker.Checker
> {
  const checker = yield* TypeScript.Checker.Checker;
  const found = Option.flatten(
    Array.head(yield* checker.getSymbolAtLocation([node])),
  );

  if (Option.isNone(found)) {
    return Option.none();
  }

  return Option.some(yield* TypeScript.Checker.resolveAlias(found.value));
});

/** The symbol `node` names, which must resolve because the AST holds it, as the name of a type reference does. `Reach` gives it a node where the parse meets the name. */
export const required = (
  node: Syntax.Node,
): Effect.Effect<
  AST.Target.InternedSymbol,
  Failure,
  Reach | TypeScript.Checker.Checker
> =>
  symbolAt(node).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            AST.ParseError.unresolvedReference({
              file: node.getSourceFile().fileName,
              text: node.getText(),
            }),
          ),
        onSome: (symbol) => Effect.flatMap(Reach, ({ reach }) => reach(symbol)),
      }),
    ),
  );

/** The name an Effect module qualifies `symbol` with, as in `Equal.Equal`, or else its own name. */
const nameOf = Effect.fnUntraced(function* (symbol: CompilerSymbol) {
  const program = yield* TypeScript.Program.Program;
  const declarations = yield* program.declarations(symbol);

  return pipe(
    Array.head(declarations),
    Option.flatMap((node) =>
      ExternalTarget.effectModuleOf(node.getSourceFile().fileName),
    ),
    Option.match({
      onNone: () => symbol.name,
      onSome: (module) => `${module}.${symbol.name}`,
    }),
  );
});

/** The item outside the package `symbol` names, with its documented name, its pages and its bases. A dependency's types cannot extend the package's, so its bases are outside the package too. */
export const external = (
  symbol: CompilerSymbol,
): Effect.Effect<
  AST.ExternalItem.InternedSymbol,
  Cause.UnknownError,
  | AST.Store
  | Heritage.Heritage
  | TypeScript.Program.Program
  | TypeScript.Checker.Checker
> =>
  AST.reserveSymbol([symbol], () =>
    Effect.all({
      symbol: Effect.succeed(symbol),
      name: nameOf(symbol),
      pages: ExternalTarget.pages(symbol),
      bases: Effect.flatMap(Heritage.bases(symbol), Effect.forEach(external)),
    }).pipe(Effect.map(AST.ExternalItem.make)),
  ).pipe(
    // SAFETY: `reserveSymbol` gave `symbol` the identity of the item it built for it, now or earlier.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The symbol names the item reserved for it.
    Effect.as(symbol as AST.ExternalItem.InternedSymbol),
  );

type ParseDeclaration<E, R> = (
  symbol: CompilerSymbol,
) => Effect.Effect<AST.Declaration.Interned, E, R>;

/**
 * Gives `symbol` a node and returns it as the symbol of that node. A symbol the package declares gets the declaration around it, parsed with `parse`, and any other symbol gets an item outside the package.
 *
 * A declaration the parse is still building reserves the symbols inside it before it parses the names that refer to them. A symbol such a declaration has not reserved fails, because its node would come too late for the name that reached it.
 */
export const reach = Effect.fnUntraced(function* <E, R>(
  symbol: CompilerSymbol,
  parse: ParseDeclaration<E, R>,
): Effect.fn.Return<
  AST.Target.InternedSymbol,
  E | Cause.UnknownError | AST.ParseError.ParseError,
  | R
  | AST.Store
  | Heritage.Heritage
  | TypeScript.Program.Program
  | TypeScript.Checker.Checker
> {
  const store = yield* AST.Store;
  const program = yield* TypeScript.Program.Program;
  const checker = yield* TypeScript.Checker.Checker;

  const held = store.internedSymbol(symbol);
  if (Option.isSome(held)) {
    return held.value;
  }

  let building = Option.none<CompilerSymbol>();

  for (const node of yield* program.declarations(symbol)) {
    const isExternal = yield* program.isExternal(node.getSourceFile());
    if (isExternal) {
      continue;
    }

    if (Syntax.isSourceFile(node)) {
      yield* parse(symbol);
    } else {
      const owner = ownerOf(node);

      if (Option.isSome(owner)) {
        const declared = yield* checker.getSymbolOfDeclaration(owner.value);

        if (store.isPending(yield* parse(declared))) {
          building = Option.some(declared);
        }
      }
    }
  }

  const reached = store.internedSymbol(symbol);
  if (Option.isSome(reached)) {
    return reached.value;
  }

  if (Option.isSome(building)) {
    return yield* AST.ParseError.unreservedReference({
      name: symbol.name,
      owner: building.value.name,
    });
  }

  // A symbol the package declares in syntax the AST does not hold reads like one outside the package.
  return yield* external(symbol);
});

/** Names each link in `documentation` the compiler binds, after `reach` gives its target a node. */
const nameLinks = Effect.fnUntraced(function* <E, R>(
  documentation: AST.Documentation.Documentation,
  parse: ParseDeclaration<E, R>,
): Effect.fn.Return<
  void,
  E | Cause.UnknownError | AST.ParseError.ParseError,
  | R
  | AST.Store
  | Heritage.Heritage
  | TypeScript.Program.Program
  | TypeScript.Checker.Checker
> {
  const store = yield* AST.Store;

  for (const [tag, name] of DocSource.namesOf(documentation)) {
    const symbol = yield* symbolAt(name);

    if (Option.isSome(symbol)) {
      store.name(tag, {
        target: yield* reach(symbol.value, parse),
        quickInfo: Option.none(),
      });
    }
  }
});

/**
 * Names the links the compiler binds in every comment the AST holds, giving each target a node with `reach` and parsing with `parse` the private declarations they reach.
 *
 * A link can name a declaration the parse has not met when it reads the comment. That declaration holds comments of its own, so the walk repeats over the nodes it has not seen until a pass finds no new ones. A link the compiler does not bind stays unnamed for `Links.resolve`, which reads the public names once the walk ends.
 */
export const discover = Effect.fnUntraced(function* <E, R>(
  parse: ParseDeclaration<E, R>,
): Effect.fn.Return<
  void,
  E | Cause.UnknownError | AST.ParseError.ParseError,
  | R
  | AST.Store
  | Heritage.Heritage
  | TypeScript.Program.Program
  | TypeScript.Checker.Checker
> {
  const store = yield* AST.Store;
  const seen = new Set<AST.Node.Node>();
  let unseen = true;

  while (unseen) {
    unseen = false;

    for (const node of Array.fromIterable(store.nodes())) {
      if (seen.has(node)) {
        continue;
      }

      seen.add(node);
      unseen = true;

      if (AST.Documentation.isDocumentation(node)) {
        yield* nameLinks(node, parse);
      }
    }
  }
});
