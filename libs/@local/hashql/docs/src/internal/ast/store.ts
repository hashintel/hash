import { Effect, HashMap, MutableHashMap, Option } from "effect";

import type * as AST from "../../AST/index.js";
import type { DocLinkTag } from "@microsoft/tsdoc";
import type { Data, Types } from "effect";
import type { Node, SourceFile } from "typescript/ast";
import type { Symbol as CompilerSymbol } from "typescript/async";

type Local = Types.ExtractTag<AST.Reference.Reference.Target, "Local">["node"];

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

/** Typed identities retain the relationship between a slot and its node. */
export interface Store {
  readonly entrypoints: HashMap.HashMap<string, AST.Declaration.Interned>;
  readonly get: <T extends AST.Node.Node>(id: AST.Interned.Interned<T>) => T;
  /** `id` as the identity of a node `guard` accepts, or none when the node there is of another kind. */
  readonly narrow: <T extends AST.Node.Node, R extends T>(
    id: AST.Interned.Interned<T>,
    guard: (node: T) => node is R,
  ) => Option.Option<AST.Interned.Interned<R>>;
  readonly intern: <T extends AST.Node.Node>(
    node: T,
  ) => Effect.Effect<AST.Interned.Interned<T>>;
  /**
   * Reserves an identity and builds its node with it.
   *
   * The graph holds one identity for equal nodes. When the build returns a node equal to one it already holds, `reserve` returns the identity of that node and abandons the reserved one, so a caller records again, under the returned identity, whatever its build recorded under the reserved one. A failed build abandons its identity as well, and an abandoned identity names no node.
   */
  readonly reserve: ReserveFn;
  readonly entrypoint: (name: string, id: AST.Declaration.Interned) => void;
  /** Records what a name resolves to: an identifier in code, or a `{@link}` in a comment. */
  readonly reference: (
    node: Node | DocLinkTag,
    id: AST.Reference.Interned,
  ) => void;
  readonly bindSymbol: (symbol: CompilerSymbol, id: Local) => void;
  /** The node of this AST that `symbol` declares, or none for a symbol it holds no node for. */
  readonly localOf: (symbol: CompilerSymbol) => Option.Option<Local>;
  readonly referenceAt: (
    node: Node | DocLinkTag,
  ) => Option.Option<AST.Reference.Reference>;
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

const reserveImpl =
  (
    slots: Slot[],
    lookup: MutableHashMap.MutableHashMap<AST.Node.Node, number>,
    pending: Counter,
  ): ReserveFn =>
  <T extends AST.Node.Node, E, R>(
    build: Build<T, E, R>,
  ): Effect.Effect<AST.Interned.Interned<T>, E, R> =>
    Effect.suspend(() => {
      // SAFETY: only the typed closure returned below fills this fresh slot with T.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- This closure alone assigns the fresh slot.
      const id = slots.length as AST.Interned.Interned<T>;
      slots.push({ _tag: "Pending" });
      pending.count += 1;

      const abandon = (): void => {
        pending.count -= 1;
        slots[id] = { _tag: "Abandoned" };
      };

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

          slots[id] = { _tag: "Complete", node };
          pending.count -= 1;

          MutableHashMap.set(lookup, node, id);
          return id;
        }),
      );
    });

const internImpl =
  (reserve: ReturnType<typeof reserveImpl>) =>
  <T extends AST.Node.Node>(node: T): Effect.Effect<AST.Interned.Interned<T>> =>
    reserve<T, never, never>(() => Effect.succeed(node));

/** Reserves identities so recursive references can precede their targets. */
export const make = (): Store => {
  let entrypoints = HashMap.empty<string, AST.Declaration.Interned>();
  const slots: Slot[] = [];
  const lookup = MutableHashMap.empty<AST.Node.Node, number>();
  const references = new WeakMap<Node | DocLinkTag, AST.Reference.Interned>();
  const programs = new WeakMap<AST.Documentation.Example.Example, SourceFile>();
  const bindings = MutableHashMap.empty<number, Local>();
  const pending: Counter = { count: 0 };

  const get = getImpl(slots);
  const narrow = narrowImpl(get);
  const reserve = reserveImpl(slots, lookup, pending);
  const intern = internImpl(reserve);

  const store: Store = {
    get entrypoints() {
      return entrypoints;
    },
    get,
    narrow,
    intern,
    reserve,
    entrypoint: (name, id) => {
      entrypoints = HashMap.set(entrypoints, name, id);
    },
    reference: (node, id) => {
      references.set(node, id);
    },
    bindSymbol: (symbol, id) => {
      MutableHashMap.set(bindings, symbol.id, id);
    },
    localOf: (symbol) => MutableHashMap.get(bindings, symbol.id),
    referenceAt: (node) =>
      Option.fromUndefinedOr(references.get(node)).pipe(Option.map(get)),
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
