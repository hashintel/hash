import { HashMap, MutableHashMap, Option } from "effect";

import type * as AST from "../../AST/index.js";
import type { DocLinkTag } from "@microsoft/tsdoc";
import type { Node, SourceFile } from "typescript/ast";
import type { Symbol as CompilerSymbol } from "typescript/async";

type Local = Extract<
  AST.Reference.Reference.Target,
  { readonly _tag: "Local" }
>["node"];

export interface Reservation<T extends AST.Node.Node> {
  readonly id: AST.Interned.Interned<T>;
  readonly complete: (node: T) => void;
}

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
  ) => AST.Interned.Interned<T>;
  readonly reserve: <T extends AST.Node.Node>() => Reservation<T>;
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

/** Reserves identities so recursive references can precede their targets. */
export const make = (): Store => {
  let entrypoints = HashMap.empty<string, AST.Declaration.Interned>();
  const nodes: (AST.Node.Node | undefined)[] = [];
  const lookup = MutableHashMap.empty<AST.Node.Node, number>();
  const references = new WeakMap<Node | DocLinkTag, AST.Reference.Interned>();
  const programs = new WeakMap<AST.Documentation.Example.Example, SourceFile>();
  const bindings = MutableHashMap.empty<number, Local>();
  let pending = 0;

  const get = <T extends AST.Node.Node>(id: AST.Interned.Interned<T>): T => {
    const node = nodes[id];

    if (node === undefined) {
      throw new Error(`AST identity ${id} has no completed node`);
    }

    // SAFETY: intern and reserve associate this index with T, and only reserve's typed completion can populate it.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The typed identity carries the slot's node type.
    return node as T;
  };

  const narrow = <T extends AST.Node.Node, R extends T>(
    id: AST.Interned.Interned<T>,
    guard: (node: T) => node is R,
  ): Option.Option<AST.Interned.Interned<R>> =>
    Option.liftPredicate(get(id), guard).pipe(
      // SAFETY: the slot `id` names holds the node `guard` accepted, so `id` names an R.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The guard checked the node in this slot.
      Option.as(id as AST.Interned.Interned<R>),
    );

  const reserve = <T extends AST.Node.Node>(): Reservation<T> => {
    // SAFETY: only the typed closure returned below fills this fresh slot with T.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- This closure alone assigns the fresh slot.
    const id = nodes.length as AST.Interned.Interned<T>;
    nodes.push(undefined);
    pending += 1;

    return {
      id,
      complete: (node) => {
        if (nodes[id] !== undefined) {
          throw new Error(`AST identity ${id} is already completed`);
        }

        nodes[id] = node;
        pending -= 1;
        MutableHashMap.set(lookup, node, id);
      },
    };
  };

  const intern = <T extends AST.Node.Node>(
    node: T,
  ): AST.Interned.Interned<T> => {
    const existing = MutableHashMap.get(lookup, node);

    if (Option.isSome(existing)) {
      // SAFETY: node equality includes the concrete kind and every owned field, so an equal stored node has T's shape.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Equal nodes have the same concrete kind and fields.
      return existing.value as AST.Interned.Interned<T>;
    }

    const reservation = reserve<T>();
    reservation.complete(node);

    return reservation.id;
  };

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
      for (const node of nodes) {
        if (node !== undefined) {
          yield node;
        }
      }
    },
    finish: () => {
      if (pending !== 0) {
        throw new Error(`AST has ${pending} incomplete identities`);
      }

      return store;
    },
  };

  return store;
};
