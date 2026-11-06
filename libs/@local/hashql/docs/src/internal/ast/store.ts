import { Effect, HashMap, MutableHashMap, Option } from "effect";

import type * as AST from "../../AST/index.js";
import type * as QuickInfo from "../../QuickInfo.js";
import type { DocLinkTag } from "@microsoft/tsdoc";
import type { Array, Data } from "effect";
import type { Node, SourceFile } from "typescript/ast";
import type { Symbol as CompilerSymbol } from "typescript/async";

// oxlint-disable typescript/ban-types -- effect no-content marker
// eslint-disable typescript/no-empty-object-type -- effect no-content marker
type Slot = Data.TaggedEnum<{
  Pending: {};
  Complete: { node: AST.Node.Node };
  Abandoned: {};
}>;
// oxlint-enable typescript/ban-types, typescript/no-empty-object-type

export type Build<T extends AST.Node.Node, E, R> = (
  id: AST.Interned.Interned<T>,
) => Effect.Effect<T, E, R>;

type ReserveFn = <T extends AST.Node.Node, E, R>(
  build: Build<T, E, R>,
) => Effect.Effect<AST.Interned.Interned<T>, E, R>;

type ReserveSymbolFn = <T extends AST.Target.Target, E, R>(
  symbols: Array.NonEmptyReadonlyArray<CompilerSymbol>,
  build: Build<T, E, R>,
) => Effect.Effect<AST.Interned.Interned<T>, E, R>;

/** What a name the AST's own nodes do not hold resolves to: a `{@link}` in a comment, or an identifier in an example's code. */
export interface Name {
  readonly target: AST.Target.InternedSymbol;
  /** What an editor shows on hover over the name, for a name in an example's code. */
  readonly quickInfo: Option.Option<QuickInfo.QuickInfo>;
}

/** Typed identities retain the relationship between a slot and its node. */
export interface Store {
  readonly entrypoints: HashMap.HashMap<string, AST.Declaration.Interned>;
  readonly get: <T extends AST.Node.Node>(id: AST.Interned.Interned<T>) => T;
  /** The node `symbol` names. */
  readonly getBySymbol: <T extends AST.Target.Target>(
    symbol: AST.Interned.InternedSymbol<T>,
  ) => T;

  /** The identity of the node `symbol` names. */
  readonly idOf: <T extends AST.Target.Target>(
    symbol: AST.Interned.InternedSymbol<T>,
  ) => AST.Interned.Interned<T>;

  /** The identity reserved for the node `symbol` names, whether or not its build has finished, or none while nothing has reserved one. */
  readonly lookup: (
    symbol: CompilerSymbol,
  ) => Option.Option<AST.Target.Interned>;

  /** The first symbol that names the node at `id`, or none for a node no symbol names, such as an index signature. */
  readonly symbolOf: <T extends AST.Target.Target>(
    id: AST.Interned.Interned<T>,
  ) => Option.Option<AST.Interned.InternedSymbol<T>>;

  /** `id` as the identity of a node `guard` accepts, or none when the node there is of another kind. */
  readonly narrow: <T extends AST.Node.Node, R extends T>(
    id: AST.Interned.Interned<T>,
    guard: (node: T) => node is R,
  ) => Option.Option<AST.Interned.Interned<R>>;

  /** `symbol` as the name of the node reserved for it, whether or not its build has finished, or none while nothing has reserved one. */
  readonly internedSymbol: (
    symbol: CompilerSymbol,
  ) => Option.Option<AST.Target.InternedSymbol>;

  readonly intern: <T extends AST.Node.Node>(
    node: T,
  ) => Effect.Effect<AST.Interned.Interned<T>>;
  /**
   * Reserves an identity and builds its node with it.
   *
   * The graph holds one identity for equal nodes. When the build returns a node equal to one it already holds, `reserve` returns the identity of that node and abandons the reserved one, so a caller records again, under the returned identity, whatever its build recorded under the reserved one. A failed build abandons its identity as well, and an abandoned identity names no node.
   */
  readonly reserve: ReserveFn;
  /** Reserves the identity `symbols` name and builds its node, unless the first of them already names one, finished or not. The symbols are the node's identity, so it never merges with an equal node. Each name a destructured parameter binds names its node. */
  readonly reserveSymbol: ReserveSymbolFn;

  readonly entrypoint: (name: string, id: AST.Declaration.Interned) => void;

  /** Records what a `{@link}` in a comment or a name in an example's code resolves to. */
  readonly name: (node: Node | DocLinkTag, name: Name) => void;
  /** What a `{@link}` in a comment or a name in an example's code resolves to, or none for one that resolves to nothing. */
  readonly nameOf: (node: Node | DocLinkTag) => Option.Option<Name>;

  /** Records the source file an example's code was compiled as. */
  readonly program: (
    example: AST.Documentation.Example.Example,
    file: SourceFile,
  ) => void;

  /** The source file an example's code was compiled as, or none for an example whose language the compiler does not read. */
  readonly programOf: (
    example: AST.Documentation.Example.Example,
  ) => Option.Option<SourceFile>;

  readonly nodes: () => IterableIterator<AST.Node.Node>;
  readonly finish: () => Store;
}

interface Counter {
  count: number;
}

const getImpl =
  (slots: readonly Slot[]) =>
  <T extends AST.Node.Node>(id: AST.Interned.Interned<T>): T => {
    const slot = slots[id];

    if (slot === undefined || slot._tag === "Pending") {
      throw new Error(`AST identity ${id} has no completed node`);
    }

    if (slot._tag === "Abandoned") {
      throw new Error(
        `AST identity ${id} has been abandoned, but has been used anyway.`,
      );
    }

    // SAFETY: intern and reserve associate this index with T, and only reserve's typed completion can populate it.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The typed identity carries the slot's node type.
    return slot.node as T;
  };

const narrowImpl =
  (get: ReturnType<typeof getImpl>) =>
  <T extends AST.Node.Node, R extends T>(
    id: AST.Interned.Interned<T>,
    guard: (node: T) => node is R,
  ): Option.Option<AST.Interned.Interned<R>> =>
    Option.liftPredicate(get(id), guard).pipe(
      // SAFETY: the slot `id` names holds the node `guard` accepted, so `id` names an R.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The guard checked the node in this slot.
      Option.as(id as AST.Interned.Interned<R>),
    );

/** A pending slot, the way to fill it with its node, and the way to give it up when its build fails or an equal node already exists. */
interface Opened<T> {
  readonly id: AST.Interned.Interned<T>;
  readonly complete: (node: T) => void;
  readonly abandon: () => void;
}

type OpenFn = <T extends AST.Node.Node>() => Opened<T>;

const openImpl =
  (slots: Slot[], pending: Counter): OpenFn =>
  <T extends AST.Node.Node>(): Opened<T> => {
    // SAFETY: only the build that opened this slot fills it, with a T.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The opener alone assigns the fresh slot.
    const id = slots.length as AST.Interned.Interned<T>;
    slots.push({ _tag: "Pending" });
    pending.count += 1;

    const complete = (node: T): void => {
      slots[id] = { _tag: "Complete", node };
      pending.count -= 1;
    };

    const abandon = (): void => {
      pending.count -= 1;
      slots[id] = { _tag: "Abandoned" };
    };

    return { id, complete, abandon };
  };

const reserveImpl =
  (
    open: OpenFn,
    lookup: MutableHashMap.MutableHashMap<AST.Node.Node, number>,
  ): ReserveFn =>
  <T extends AST.Node.Node, E, R>(
    build: Build<T, E, R>,
  ): Effect.Effect<AST.Interned.Interned<T>, E, R> =>
    Effect.suspend(() => {
      const { id, complete, abandon } = open<T>();

      return build(id).pipe(
        Effect.onError(() => Effect.sync(abandon)),
        Effect.map((node) => {
          const existing = MutableHashMap.get(lookup, node);
          if (existing._tag === "Some") {
            abandon();

            // SAFETY: node equality includes the concrete kind and every owned field, so an equal stored node has T's shape.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Equal nodes have the same concrete kind and fields.
            return existing.value as AST.Interned.Interned<T>;
          }

          complete(node);
          MutableHashMap.set(lookup, node, id);
          return id;
        }),
      );
    });

/** The identities symbols name, in both directions. */
interface Symbols {
  readonly byId: Map<number, CompilerSymbol>;
  readonly bySymbol: MutableHashMap.MutableHashMap<number, number>;
}

const reserveSymbolImpl =
  (
    open: OpenFn,
    lookup: MutableHashMap.MutableHashMap<AST.Node.Node, number>,
    symbols: Symbols,
  ): ReserveSymbolFn =>
  <T extends AST.Target.Target, E, R>(
    named: Array.NonEmptyReadonlyArray<CompilerSymbol>,
    build: Build<T, E, R>,
  ): Effect.Effect<AST.Interned.Interned<T>, E, R> =>
    Effect.suspend(() => {
      const [first] = named;
      const existing = MutableHashMap.get(symbols.bySymbol, first.id);

      if (Option.isSome(existing)) {
        // SAFETY: the first build for these symbols built its node as a T, and a symbol names one node.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- A symbol's identity keeps the type of its first build.
        return Effect.succeed(existing.value as AST.Interned.Interned<T>);
      }

      const { id, complete, abandon } = open<T>();
      for (const symbol of named) {
        MutableHashMap.set(symbols.bySymbol, symbol.id, id);
      }
      symbols.byId.set(id, first);

      return build(id).pipe(
        Effect.onError(() =>
          Effect.sync(() => {
            for (const symbol of named) {
              MutableHashMap.remove(symbols.bySymbol, symbol.id);
            }

            symbols.byId.delete(id);
            abandon();
          }),
        ),
        Effect.map((node) => {
          complete(node);

          // Interning an equal node finds this identity, unless an equal node already had one.
          if (!MutableHashMap.has(lookup, node)) {
            MutableHashMap.set(lookup, node, id);
          }

          return id;
        }),
      );
    });

const internImpl =
  (reserve: ReserveFn) =>
  <T extends AST.Node.Node>(node: T): Effect.Effect<AST.Interned.Interned<T>> =>
    reserve<T, never, never>(() => Effect.succeed(node));

const idOfImpl =
  (symbols: Symbols) =>
  <T extends AST.Target.Target>(
    symbol: AST.Interned.InternedSymbol<T>,
  ): AST.Interned.Interned<T> => {
    const id = MutableHashMap.get(symbols.bySymbol, symbol.id);

    if (Option.isNone(id)) {
      throw new Error(`symbol ${symbol.name} names no node of the AST`);
    }

    // SAFETY: an interned symbol carries the type of the node its reservation built.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The interned symbol carries the node type of its identity.
    return id.value as AST.Interned.Interned<T>;
  };

const lookupImpl =
  (symbols: Symbols) =>
  (symbol: CompilerSymbol): Option.Option<AST.Target.Interned> => {
    const id = MutableHashMap.get(symbols.bySymbol, symbol.id);

    // SAFETY: only `reserveSymbol` indexes a symbol, and it builds a target.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Symbols name targets alone.
    return id as Option.Option<AST.Target.Interned>;
  };

const internedSymbolImpl =
  (symbols: Symbols) =>
  (symbol: CompilerSymbol): Option.Option<AST.Target.InternedSymbol> =>
    MutableHashMap.get(symbols.bySymbol, symbol.id).pipe(
      // SAFETY: only `reserveSymbol` maps a symbol, and it reserves a target for it.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The store holds a node for this symbol.
      Option.as(symbol as AST.Target.InternedSymbol),
    );

const symbolOfImpl =
  (symbols: Symbols) =>
  <T extends AST.Target.Target>(
    id: AST.Interned.Interned<T>,
  ): Option.Option<AST.Interned.InternedSymbol<T>> => {
    const symbol = Option.fromUndefinedOr(symbols.byId.get(id));

    // SAFETY: the symbol reserved `id`, so it names the node at `id`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The symbol and the identity name the same node.
    return symbol as Option.Option<AST.Interned.InternedSymbol<T>>;
  };

/** Reserves identities so recursive references can precede their targets. */
export const make = (): Store => {
  let entrypoints = HashMap.empty<string, AST.Declaration.Interned>();
  const slots: Slot[] = [];
  const lookup = MutableHashMap.empty<AST.Node.Node, number>();
  const symbols: Symbols = {
    byId: new Map(),
    bySymbol: MutableHashMap.empty(),
  };
  const names = new WeakMap<Node | DocLinkTag, Name>();
  const programs = new WeakMap<AST.Documentation.Example.Example, SourceFile>();
  const pending: Counter = { count: 0 };

  const get = getImpl(slots);
  const narrow = narrowImpl(get);
  const open = openImpl(slots, pending);
  const reserve = reserveImpl(open, lookup);
  const reserveSymbol = reserveSymbolImpl(open, lookup, symbols);
  const intern = internImpl(reserve);
  const idOf = idOfImpl(symbols);

  const store: Store = {
    get entrypoints() {
      return entrypoints;
    },
    get,
    getBySymbol: (symbol) => get(idOf(symbol)),
    idOf,
    lookup: lookupImpl(symbols),
    symbolOf: symbolOfImpl(symbols),
    narrow,
    internedSymbol: internedSymbolImpl(symbols),
    intern,
    reserve,
    reserveSymbol,
    entrypoint: (name, id) => {
      entrypoints = HashMap.set(entrypoints, name, id);
    },
    name: (node, name) => {
      names.set(node, name);
    },
    nameOf: (node) => Option.fromUndefinedOr(names.get(node)),
    program: (example, file) => {
      programs.set(example, file);
    },
    programOf: (example) => Option.fromUndefinedOr(programs.get(example)),
    *nodes() {
      for (const slot of slots) {
        if (slot._tag === "Complete") {
          yield slot.node;
        }
      }
    },
    finish: () => {
      if (pending.count !== 0) {
        throw new Error(`AST has ${pending.count} incomplete identities`);
      }

      return store;
    },
  };

  return store;
};
