import { Array, Chunk, Effect, Option, pipe } from "effect";
import * as Syntax from "typescript/ast";

import * as AST from "../AST/index.js";
import * as ExternalTarget from "../ExternalTarget.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Heritage from "./ast-heritage.js";
import * as DocSource from "./ast/doc-source.js";
import * as Source from "./ast/source.js";

import type { Cause } from "effect";
import type { Symbol as CompilerSymbol } from "typescript/async";

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

/**
 * `symbol` as a node of the AST holds it, for a name that resolves to it.
 *
 * The symbol need not name a node yet. `discover` reserves one for every symbol a node holds before the parse finishes, and the examples reserve one for each of theirs as they resolve it.
 */
export const claim = (symbol: CompilerSymbol): AST.Target.InternedSymbol =>
  // SAFETY: every caller holds the symbol in a node `discover` walks, or reserves its node before recording it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The parse reserves a node for each claimed symbol before it finishes.
  symbol as AST.Target.InternedSymbol;

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

/** The symbol `node` names, which must resolve because the AST holds it, as the name of a type reference does. */
export const required = (
  node: Syntax.Node,
): Effect.Effect<
  AST.Target.InternedSymbol,
  Cause.UnknownError | AST.ParseError.ParseError,
  TypeScript.Checker.Checker
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
        onSome: (symbol) => Effect.succeed(claim(symbol)),
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

/** The symbols `node` holds for the names in it, each of which must name a node of the AST. */
const heldBy = (
  store: AST.Store["Service"],
  node: AST.Node.Node,
): readonly CompilerSymbol[] => {
  if (AST.TypeReference.isTypeReference(node)) {
    return [node.target];
  }

  if (AST.TypeExpression.isTypeExpression(node)) {
    return Chunk.toReadonlyArray(node.references);
  }

  if (AST.Declaration.isDeclaration(node)) {
    return node.bases;
  }

  if (AST.Documentation.isDocumentation(node)) {
    return Array.flatMap(DocSource.linksOf(node), (tag) =>
      Option.toArray(Option.map(store.nameOf(tag), ({ target }) => target)),
    );
  }

  return [];
};

type ParseDeclaration<E> = (
  symbol: CompilerSymbol,
) => Effect.Effect<AST.Declaration.Interned, E, AST.Store>;

/** Gives `symbol` a node. A symbol the package declares gets the declaration around it, parsed with `parse`, and any other symbol gets an item outside the package. */
const reach = Effect.fnUntraced(function* <E>(
  symbol: CompilerSymbol,
  parse: ParseDeclaration<E>,
): Effect.fn.Return<
  void,
  E | Cause.UnknownError,
  | AST.Store
  | Heritage.Heritage
  | TypeScript.Program.Program
  | TypeScript.Checker.Checker
> {
  const store = yield* AST.Store;
  const program = yield* TypeScript.Program.Program;
  const checker = yield* TypeScript.Checker.Checker;

  if (Option.isSome(store.lookup(symbol))) {
    return;
  }

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
        yield* parse(yield* checker.getSymbolOfDeclaration(owner.value));
      }
    }
  }

  // A symbol the package declares in syntax the AST does not hold reads like one outside the package.
  if (Option.isNone(store.lookup(symbol))) {
    yield* external(symbol);
  }
});

/**
 * Gives every symbol a node of the AST holds a node of its own, parsing with `parse` the private declarations the names reach.
 *
 * A parsed declaration holds names of its own, so the walk repeats over the nodes it has not seen until a pass reaches nothing new.
 *
 * A reference's qualifiers parse nothing, because reading `Node` through `AST` in `AST.Node` needs nothing from the module `AST` names beyond `Node`. Once the walk ends, a qualifier the AST holds no node for gets an item outside the package. It waits for the walk because a target may still parse the declaration the qualifier names, and a symbol keeps the first node reserved for it.
 */
export const discover = Effect.fnUntraced(function* <E>(
  parse: ParseDeclaration<E>,
): Effect.fn.Return<
  void,
  E | Cause.UnknownError,
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

      for (const symbol of heldBy(store, node)) {
        yield* reach(symbol, parse);
      }
    }
  }

  for (const node of Array.fromIterable(store.nodes())) {
    if (AST.TypeReference.isTypeReference(node)) {
      for (const qualifier of node.qualifiers) {
        if (Option.isNone(store.lookup(qualifier))) {
          yield* external(qualifier);
        }
      }
    }
  }
});
