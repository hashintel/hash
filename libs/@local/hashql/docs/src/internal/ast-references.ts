import {
  Array,
  Context,
  Effect,
  Function,
  Layer,
  MutableHashMap,
  Option,
  flow,
} from "effect";
import * as Syntax from "typescript/ast";
import { SymbolFlags } from "typescript/async";

import * as AST from "../AST/index.js";
import * as ExternalTarget from "../ExternalTarget.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Targets from "./ast-targets.js";

import type { Failure, LocalTarget } from "./ast-context.js";
import type { Reservation } from "./ast/store.js";
import type { DocLinkTag } from "@microsoft/tsdoc";
import type { Cause } from "effect";
import type { Symbol as CompilerSymbol } from "typescript/async";

type Definition =
  | Syntax.ClassDeclaration
  | Syntax.InterfaceDeclaration
  | Syntax.TypeAliasDeclaration
  | Syntax.FunctionDeclaration
  | Syntax.VariableDeclaration
  | Syntax.EnumDeclaration
  | Syntax.ModuleDeclaration;

/** Whether `node` declares a name of its module or namespace, as a statement does. */
export const isDefinition = (node: Syntax.Node): node is Definition =>
  Syntax.isClassDeclaration(node) ||
  Syntax.isInterfaceDeclaration(node) ||
  Syntax.isTypeAliasDeclaration(node) ||
  Syntax.isFunctionDeclaration(node) ||
  Syntax.isVariableDeclaration(node) ||
  Syntax.isEnumDeclaration(node) ||
  Syntax.isModuleDeclaration(node);

const ownerOf = (node: Syntax.Node): Option.Option<Definition> => {
  let owner: Option.Option<Definition> = Option.none();
  let current = node;

  while (!Syntax.isSourceFile(current) && !Syntax.isModuleBlock(current)) {
    if (isDefinition(current)) {
      owner = Option.some(current);
    }

    current = current.parent;
  }

  return owner;
};

/** Resolves uses after declarations have identities, including private types reached through their signatures. */
export class References extends Context.Service<References, References.Shape>()(
  "@local/hashql-docs/internal/ast-references/References",
) {}

export declare namespace References {
  export interface Shape extends Effect.Success<typeof make> {}
}

/** A comment's `{@link}` to a declaration, as the compiler reads it. */
export interface Link {
  readonly tag: DocLinkTag;
  /** The link's name when the compiler may bind it, or else the link itself. */
  readonly node: Syntax.Node;
  /** Whether the compiler may bind `node`. A name of a package's public path is not a binding in the comment's file. */
  readonly named: boolean;
  /** The node whose comment holds the link. The declarations around it scope a name the compiler does not bind. */
  readonly owner: Syntax.Node;
}

/** One service serves one parse, so its state never sees a second graph. */
interface Graph {
  readonly targets: MutableHashMap.MutableHashMap<number, CompilerSymbol>;
  readonly pending: WeakMap<Syntax.Node, Reservation<AST.Reference.Reference>>;
  readonly required: Syntax.Node[];
  readonly sources: Syntax.Node[];
  readonly external: WeakMap<Syntax.SourceFile, boolean>;
  readonly links: Link[];
  /** The link each name the compiler may bind belongs to. Such a name resolves when the compiler binds it, and is otherwise left to a lookup of public names. */
  readonly named: WeakMap<Syntax.Node, DocLinkTag>;
}

class ReferencesState extends Context.Service<ReferencesState, Graph>()(
  "@local/hashql-docs/internal/ast-references/ReferencesState",
) {}

type Requirements =
  | AST.Store
  | ReferencesState
  | TypeScript.Checker.Checker
  | TypeScript.Program.Program
  | Targets.Targets;

const bindImpl = Effect.fnUntraced(function* (
  node: Syntax.Declaration,
  id: LocalTarget,
): Effect.fn.Return<void, Cause.UnknownError, Requirements> {
  const checker = yield* TypeScript.Checker.Checker;
  const store = yield* AST.Store;

  if (
    Syntax.isParameterDeclaration(node) &&
    Syntax.isBindingPattern(node.name)
  ) {
    const pending: Syntax.Node[] = [node.name];

    while (pending.length > 0) {
      const current = pending.pop();

      if (current !== undefined) {
        if (
          Syntax.isBindingElement(current) &&
          current.name !== undefined &&
          Syntax.isIdentifier(current.name)
        ) {
          const symbol = yield* checker.getSymbolOfDeclaration(current);
          store.bindSymbol(symbol, id);
        } else {
          pending.push(...current.childrenIter());
        }
      }
    }
  } else {
    const symbol = yield* checker.getSymbolOfDeclaration(node);
    store.bindSymbol(symbol, id);
  }
});

const sourceImpl = Effect.fnUntraced(function* (node: Syntax.Node) {
  const state = yield* ReferencesState;
  state.sources.push(node);
});

const linkImpl = Effect.fnUntraced(function* (link: Link) {
  const state = yield* ReferencesState;
  state.links.push(link);

  if (link.named) {
    state.named.set(link.node, link.tag);
  }
});

const linksImpl = Effect.map(ReferencesState, (state) =>
  Array.copy(state.links),
);

const isExternal = Effect.fnUntraced(function* (file: Syntax.SourceFile) {
  const program = yield* TypeScript.Program.Program;
  const state = yield* ReferencesState;
  const cached = state.external.get(file);

  if (cached !== undefined) {
    return cached;
  }

  const external = yield* program.isExternal(file);
  state.external.set(file, external);

  return external;
});

const localImpl = Effect.fnUntraced(function* (symbol: CompilerSymbol) {
  const program = yield* TypeScript.Program.Program;

  for (const node of yield* program.declarations(symbol)) {
    if (!(yield* isExternal(node.getSourceFile()))) {
      return true;
    }
  }

  return false;
});

const referenceImpl = Effect.fnUntraced(function* (
  node: Syntax.Node,
): Effect.fn.Return<AST.Reference.Interned, never, Requirements> {
  const store = yield* AST.Store;
  const state = yield* ReferencesState;
  const existing = state.pending.get(node);

  if (existing !== undefined) {
    return existing.id;
  }

  const reservation = store.reserve<AST.Reference.Reference>();
  state.pending.set(node, reservation);
  state.required.push(node);

  return reservation.id;
});

const targetImpl = Effect.fnUntraced(function* (
  symbol: CompilerSymbol,
): Effect.fn.Return<
  CompilerSymbol,
  Cause.UnknownError,
  ReferencesState | TypeScript.Checker.Checker
> {
  const checker = yield* TypeScript.Checker.Checker;
  const { targets } = yield* ReferencesState;
  const existing = MutableHashMap.get(targets, symbol.id);

  if (Option.isSome(existing)) {
    return existing.value;
  }

  let target = symbol;

  if (TypeScript.Symbol.hasFlag(symbol, SymbolFlags.Alias)) {
    target = yield* checker.getAliasedSymbol(symbol);
  }

  MutableHashMap.set(targets, symbol.id, target);

  return target;
});

const discover = Effect.fnUntraced(function* (
  symbol: CompilerSymbol,
  parse: (
    symbol: CompilerSymbol,
  ) => Effect.Effect<AST.Declaration.Interned, Failure, AST.Store>,
): Effect.fn.Return<void, Failure, Requirements> {
  const checker = yield* TypeScript.Checker.Checker;
  const program = yield* TypeScript.Program.Program;
  const store = yield* AST.Store;

  if (Option.isSome(store.localOf(symbol))) {
    return;
  }

  for (const node of yield* program.declarations(symbol)) {
    const owner = ownerOf(node);

    if (!(yield* isExternal(node.getSourceFile()))) {
      if (Syntax.isSourceFile(node)) {
        yield* parse(symbol);
      } else if (Option.isSome(owner)) {
        const definition = yield* checker.getSymbolOfDeclaration(owner.value);
        yield* parse(definition);
      }
    }
  }
});

const collect = Effect.fnUntraced(function* ({
  seen,
  scanned,
}: {
  readonly seen: WeakSet<Syntax.Node>;
  readonly scanned: WeakSet<Syntax.Node>;
}): Effect.fn.Return<readonly Syntax.Node[], never, Requirements> {
  const state = yield* ReferencesState;
  const nodes: Syntax.Node[] = [];
  const add = (node: Syntax.Node): void => {
    if (!seen.has(node)) {
      seen.add(node);
      nodes.push(node);
    }
  };

  for (const node of state.required) {
    add(node);
  }

  for (const { node, named } of state.links) {
    if (named) {
      add(node);
    }
  }

  const pending = Array.copy(state.sources);

  while (pending.length > 0) {
    const node = pending.pop();

    if (node !== undefined && !scanned.has(node)) {
      scanned.add(node);

      if (Syntax.isIdentifier(node)) {
        add(node);
      }

      pending.push(...node.childrenIter());
    }
  }

  return nodes;
});

const resolveImpl = Effect.fnUntraced(function* (
  parse: (
    symbol: CompilerSymbol,
  ) => Effect.Effect<AST.Declaration.Interned, Failure, AST.Store>,
): Effect.fn.Return<void, Failure, Requirements> {
  const checker = yield* TypeScript.Checker.Checker;
  const store = yield* AST.Store;
  const state = yield* ReferencesState;
  const seen = new WeakSet<Syntax.Node>();
  const scanned = new WeakSet<Syntax.Node>();
  const resolved: (readonly [Syntax.Node, CompilerSymbol])[] = [];
  let batch = yield* collect({ seen, scanned });

  while (batch.length > 0) {
    const symbols = yield* checker.getSymbolAtLocation(batch);

    for (const [node, found] of Array.zip(batch, symbols)) {
      if (Option.isSome(found)) {
        const symbol = yield* targetImpl(found.value);
        resolved.push([node, symbol]);
        yield* discover(symbol, parse);
      } else if (state.pending.has(node)) {
        return yield* AST.ParseError.unresolvedReference({
          file: node.getSourceFile().fileName,
          text: node.getText(),
        });
      }
    }
    batch = yield* collect({ seen, scanned });
  }

  for (const [node, symbol] of resolved) {
    const link = state.named.get(node);
    // A link names a declaration, which for a type and a namespace of the same name is the type.
    let reading: ExternalTarget.Meaning = "type";

    if (link === undefined) {
      reading = ExternalTarget.meaning(node);
    }

    const reference = yield* Targets.reference({
      node,
      symbol,
      reading,
      quickInfo: Option.none(),
    });
    const reserved = state.pending.get(node);
    reserved?.complete(reference);
    const id = reserved?.id ?? store.intern(reference);

    store.reference(node, id);

    if (link !== undefined) {
      store.reference(link, id);
    }
  }
});

const make = Effect.context<
  TypeScript.Checker.Checker | TypeScript.Program.Program | Targets.Targets
>().pipe(
  Effect.map((services) => {
    const graph: Graph = {
      targets: MutableHashMap.empty(),
      pending: new WeakMap(),
      required: [],
      sources: [],
      external: new WeakMap(),
      links: [],
      named: new WeakMap(),
    };
    const context = Context.add(services, ReferencesState, graph);

    return {
      bind: flow(bindImpl, Effect.provide(context)),
      source: flow(sourceImpl, Effect.provide(context)),
      reference: flow(referenceImpl, Effect.provide(context)),
      link: flow(linkImpl, Effect.provide(context)),
      links: Effect.provide(linksImpl, context),
      local: flow(localImpl, Effect.provide(context)),
      target: flow(targetImpl, Effect.provide(context)),
      resolve: flow(resolveImpl, Effect.provide(context)),
    };
  }),
);

export const layer = Layer.effect(References, make);

/** The symbol an alias finally names, or `symbol` itself when it is no alias. */
export const target = (
  symbol: CompilerSymbol,
): Effect.Effect<CompilerSymbol, Cause.UnknownError, References> =>
  Effect.flatMap(References, (references) => references.target(symbol));

/** Binds the symbols `node` declares to `id`, including each name a destructured parameter binds. */
export const bind: {
  (
    id: LocalTarget,
  ): (
    node: Syntax.Declaration,
  ) => Effect.Effect<void, Cause.UnknownError, References | AST.Store>;
  (
    node: Syntax.Declaration,
    id: LocalTarget,
  ): Effect.Effect<void, Cause.UnknownError, References | AST.Store>;
} = Function.dual(2, (node: Syntax.Declaration, id: LocalTarget) =>
  Effect.flatMap(References, (references) => references.bind(node, id)),
);

/** Resolves every recorded name once declarations have identities, parsing the private declarations names reach through `parse`. */
export const resolve = (
  parse: (
    symbol: CompilerSymbol,
  ) => Effect.Effect<AST.Declaration.Interned, Failure, AST.Store>,
): Effect.Effect<void, Failure, References | AST.Store> =>
  Effect.flatMap(References, (references) => references.resolve(parse));

/** Records `node` as syntax whose names must resolve, without reserving any of them. */
export const source = (
  node: Syntax.Node,
): Effect.Effect<void, never, References> =>
  Effect.flatMap(References, (references) => references.source(node));

/** The reference a name will resolve to, reserved now so the node that uses it can be built first. */
export const reference = (
  node: Syntax.Node,
): Effect.Effect<AST.Reference.Interned, never, References | AST.Store> =>
  Effect.flatMap(References, (references) => references.reference(node));

/** Records a comment's link, whose name resolves with the other names when the compiler binds it. */
export const link = (link: Link): Effect.Effect<void, never, References> =>
  Effect.flatMap(References, (references) => references.link(link));

/** Every link recorded so far, in the order the comments were parsed. */
export const links: Effect.Effect<readonly Link[], never, References> =
  Effect.flatMap(References, (references) => references.links);

/** Whether the package declares `symbol`, rather than a dependency or the default library. */
export const local = (
  symbol: CompilerSymbol,
): Effect.Effect<boolean, Cause.UnknownError, References> =>
  Effect.flatMap(References, (references) => references.local(symbol));
