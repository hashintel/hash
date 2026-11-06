import {
  Array,
  Context,
  Effect,
  Layer,
  MutableHashMap,
  Option,
  pipe,
} from "effect";

import * as AST from "../AST/index.js";
import * as ExternalTarget from "../ExternalTarget.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Heritage from "./ast-heritage.js";

import type * as QuickInfo from "../QuickInfo.js";
import type { Cause } from "effect";
import type { Node } from "typescript/ast";
import type { Symbol as CompilerSymbol } from "typescript/async";

type Target = AST.Reference.Reference.Target;
type External = Extract<Target, { readonly _tag: "External" }>;

/** What a symbol is to the reference: a node of the AST, or a symbol outside it with the pages that document it. */
export class Targets extends Context.Service<Targets, Targets.Shape>()(
  "@local/hashql-docs/internal/ast-targets/Targets",
) {}

export declare namespace Targets {
  export interface Shape {
    /** The node of the AST that declares `symbol`, or else `symbol` outside the AST with its documented name, the page of its type and its bases. */
    readonly target: (
      symbol: CompilerSymbol,
    ) => Effect.Effect<Target, Cause.UnknownError, AST.Store>;
    /** The page that documents `symbol` as a name reads where it stands. */
    readonly url: (
      symbol: CompilerSymbol,
      reading: ExternalTarget.Meaning,
    ) => Effect.Effect<Option.Option<URL>, Cause.UnknownError>;
  }
}

const make = Effect.gen(function* () {
  const program = yield* TypeScript.Program.Program;
  const heritage = yield* Heritage.Heritage;
  const compiler = yield* Effect.context<
    TypeScript.Program.Program | TypeScript.Checker.Checker
  >();
  const externals = MutableHashMap.empty<number, External>();
  const pages = MutableHashMap.empty<
    readonly [number, ExternalTarget.Meaning],
    Option.Option<URL>
  >();

  const url = Effect.fnUntraced(function* (
    symbol: CompilerSymbol,
    reading: ExternalTarget.Meaning,
  ) {
    const key = [symbol.id, reading] as const;
    const existing = MutableHashMap.get(pages, key);

    if (Option.isSome(existing)) {
      return existing.value;
    }

    const page = yield* ExternalTarget.resolve({ symbol, reading }).pipe(
      Effect.provideContext(compiler),
    );
    MutableHashMap.set(pages, key, page);

    return page;
  });

  /** An Effect module qualifies the names it declares, as in `Equal.Equal`. */
  const nameOf = Effect.fnUntraced(function* (symbol: CompilerSymbol) {
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

  // A dependency's types cannot extend the package's, so an external symbol's bases are external too.
  const external = (
    symbol: CompilerSymbol,
  ): Effect.Effect<External, Cause.UnknownError> =>
    Effect.gen(function* () {
      const existing = MutableHashMap.get(externals, symbol.id);

      if (Option.isSome(existing)) {
        return existing.value;
      }

      const target: External = {
        _tag: "External",
        symbol,
        name: yield* nameOf(symbol),
        url: yield* url(symbol, "type"),
        bases: yield* heritage
          .bases(symbol)
          .pipe(Effect.flatMap(Effect.forEach(external))),
      };
      MutableHashMap.set(externals, symbol.id, target);

      return target;
    });

  const target = Effect.fnUntraced(function* (
    symbol: CompilerSymbol,
  ): Effect.fn.Return<Target, Cause.UnknownError, AST.Store> {
    const store = yield* AST.Store;
    const local = store.localOf(symbol);

    if (Option.isSome(local)) {
      return { _tag: "Local", node: local.value };
    }

    return yield* external(symbol);
  });

  return Targets.of({ target, url });
});

/** One service serves one program, so a cached page never belongs to another program's symbol. */
export const layer = Layer.effect(Targets, make);

/** The node of the AST that declares `symbol`, or else `symbol` outside the AST. */
export const target = (
  symbol: CompilerSymbol,
): Effect.Effect<Target, Cause.UnknownError, Targets | AST.Store> =>
  Effect.flatMap(Targets, (targets) => targets.target(symbol));

/** What `node` refers to once the compiler binds it to `symbol`. A name outside the AST links to the page of what it means where it stands, read as `reading`. */
export const reference = Effect.fnUntraced(function* ({
  node,
  symbol,
  reading,
  quickInfo,
}: {
  readonly node: Node;
  readonly symbol: CompilerSymbol;
  readonly reading: ExternalTarget.Meaning;
  readonly quickInfo: Option.Option<QuickInfo.QuickInfo>;
}): Effect.fn.Return<
  AST.Reference.Reference,
  Cause.UnknownError,
  Targets | AST.Store
> {
  const targets = yield* Targets;
  const resolved = yield* targets.target(symbol);
  let url = Option.none<URL>();

  if (resolved._tag === "External") {
    url = yield* targets.url(symbol, reading);
  }

  return AST.Reference.make({ node, target: resolved, url, quickInfo });
});
