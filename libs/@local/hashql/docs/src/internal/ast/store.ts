import { Array, Effect, HashMap, MutableHashMap, Option } from "effect";

import type * as AST from "../../AST/index.js";
import type * as QuickInfo from "../../QuickInfo.js";
import type { DocLinkTag } from "@microsoft/tsdoc";
import type { Data } from "effect";
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

/** A node to reserve with its siblings, with the symbols that name it and the build that makes it. A node no symbol names has no symbols. */
export interface Entry<T extends AST.Target.Target, E, R> {
  readonly symbols: readonly CompilerSymbol[];
  readonly build: Build<T, E, R>;
}

type ReserveSymbolsFn = <T extends AST.Target.Target, E, R>(
  entries: readonly Entry<T, E, R>[],
) => Effect.Effect<readonly AST.Interned.Interned<T>[], E, R>;

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
  /**
   * Reserves each entry like `reserveSymbol` and builds the entries in order once every one is reserved, so a node can refer to a sibling declared after it, as `A` refers to `B` in `<A extends B, B>`.
   *
   * An entry no symbol names cannot be referred to, so it reserves nothing ahead and interns like `reserve` when its turn comes.
   */
  readonly reserveSymbols: ReserveSymbolsFn;
  /** Whether the node at `id` is reserved and its build has not finished. */
  readonly isPending: <T extends AST.Node.Node>(
    id: AST.Interned.Interned<T>,
  ) => boolean;

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

/** What reserving an entry found. A symbol may already name an identity, or the entry opens one for its build. A node no symbol names gets its identity once `reserve` interns its build. */
type Reservation<T extends AST.Target.Target, E, R> =
  | { readonly _tag: "Named"; readonly id: AST.Interned.Interned<T> }
  | {
      readonly _tag: "Opened";
      readonly opened: Opened<T>;
      readonly entry: Entry<T, E, R>;
    }
  | { readonly _tag: "Anonymous"; readonly entry: Entry<T, E, R> };

/** Reserves an entry and builds it in its turn. When a build fails, it gives up the identities left unbuilt. */
interface Reserver {
  readonly reserve: <T extends AST.Target.Target, E, R>(
    entry: Entry<T, E, R>,
  ) => Reservation<T, E, R>;
  readonly build: <T extends AST.Target.Target, E, R>(
    reservation: Reservation<T, E, R>,
  ) => Effect.Effect<AST.Interned.Interned<T>, E, R>;
  readonly release: <T extends AST.Target.Target, E, R>(
    reservations: readonly Reservation<T, E, R>[],
  ) => void;
}

const reserverImpl = ({
  slots,
  open,
  reserve,
  lookup,
  symbols,
}: {
  readonly slots: readonly Slot[];
  readonly open: OpenFn;
  readonly reserve: ReserveFn;
  readonly lookup: MutableHashMap.MutableHashMap<AST.Node.Node, number>;
  readonly symbols: Symbols;
}): Reserver => ({
  reserve: <T extends AST.Target.Target, E, R>(
    entry: Entry<T, E, R>,
  ): Reservation<T, E, R> => {
    const first = Array.head(entry.symbols);

    if (Option.isNone(first)) {
      return { _tag: "Anonymous", entry };
    }

    const existing = MutableHashMap.get(symbols.bySymbol, first.value.id);

    if (Option.isSome(existing)) {
      // SAFETY: the first build for these symbols built its node as a T, and a symbol names one node.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- A symbol's identity keeps the type of its first build.
      return { _tag: "Named", id: existing.value as AST.Interned.Interned<T> };
    }

    const opened = open<T>();
    for (const symbol of entry.symbols) {
      MutableHashMap.set(symbols.bySymbol, symbol.id, opened.id);
    }
    symbols.byId.set(opened.id, first.value);

    return { _tag: "Opened", opened, entry };
  },
  build: <T extends AST.Target.Target, E, R>(
    reservation: Reservation<T, E, R>,
  ): Effect.Effect<AST.Interned.Interned<T>, E, R> => {
    switch (reservation._tag) {
      case "Named": {
        return Effect.succeed(reservation.id);
      }
      case "Anonymous": {
        return reserve(reservation.entry.build);
      }
      case "Opened": {
        const { opened, entry } = reservation;

        return Effect.map(entry.build(opened.id), (node) => {
          opened.complete(node);

          // Interning an equal node finds this identity, unless an equal node already had one.
          if (!MutableHashMap.has(lookup, node)) {
            MutableHashMap.set(lookup, node, opened.id);
          }

          return opened.id;
        });
      }
    }
  },
  release: (reservations) => {
    for (const reservation of reservations) {
      if (
        reservation._tag === "Opened" &&
        slots[reservation.opened.id]?._tag === "Pending"
      ) {
        for (const symbol of reservation.entry.symbols) {
          MutableHashMap.remove(symbols.bySymbol, symbol.id);
        }

        symbols.byId.delete(reservation.opened.id);
        reservation.opened.abandon();
      }
    }
  },
});

const reserveSymbolImpl =
  (reserver: Reserver): ReserveSymbolFn =>
  <T extends AST.Target.Target, E, R>(
    named: Array.NonEmptyReadonlyArray<CompilerSymbol>,
    build: Build<T, E, R>,
  ): Effect.Effect<AST.Interned.Interned<T>, E, R> =>
    Effect.suspend(() => {
      const reservation = reserver.reserve({ symbols: named, build });

      return reserver.build(reservation).pipe(
        Effect.onError(() =>
          Effect.sync(() => {
            reserver.release([reservation]);
          }),
        ),
      );
    });

const reserveSymbolsImpl =
  (reserver: Reserver): ReserveSymbolsFn =>
  <T extends AST.Target.Target, E, R>(
    entries: readonly Entry<T, E, R>[],
  ): Effect.Effect<readonly AST.Interned.Interned<T>[], E, R> =>
    Effect.suspend(() => {
      const reservations = Array.map(entries, reserver.reserve);

      return Effect.forEach(reservations, reserver.build).pipe(
        Effect.onError(() =>
          Effect.sync(() => {
            reserver.release(reservations);
          }),
        ),
      );
    });

const isPendingImpl =
  (slots: readonly Slot[]) =>
  <T extends AST.Node.Node>(id: AST.Interned.Interned<T>): boolean =>
    slots[id]?._tag === "Pending";

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
  const reserver = reserverImpl({ slots, open, reserve, lookup, symbols });
  const reserveSymbol = reserveSymbolImpl(reserver);
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
    reserveSymbols: reserveSymbolsImpl(reserver),
    isPending: isPendingImpl(slots),
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
