import type * as Unist from "unist";

/**
 * A node of the documentation tree, and the origin the tree distilled it from.
 *
 * The origin is an AST node, the compiler or TSDoc node it holds, or the catalogue's entry for a public declaration. The origin locates the node, so the tree carries no copied positions, source text or destinations, and an output resolves them with the tree in hand.
 */
export interface Node<Type extends string, Origin> extends Unist.Node {
  readonly type: Type;
  readonly origin: Origin;
}

/** A node whose children form a sequence. A part that occurs at most once is a field of its node instead, so an adapter places it. */
export interface Parent<
  Type extends string,
  Origin,
  Child extends Unist.Node,
> extends Node<Type, Origin> {
  readonly children: readonly Child[];
}
