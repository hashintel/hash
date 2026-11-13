import { fold } from "../../internal/fold.js";

import type * as Referential from "../../internal/referential.js";
import type * as JExpr from "../../JExpr/index.js";
import type { Pipeable } from "effect";

/**
 * A builder node that emits J-Expr type syntax.
 *
 * A type node describes one level of a type: its child nodes, and how their syntax combines into its own. It keeps the ids of the bindings its own syntax names under {@link Referential.References}, as an expression node does. {@link compile} walks the levels through an explicit stack. Implement {@link TypeNode.Of}, which ties the syntax `toType` takes to `children`.
 */
export interface TypeNode<Type extends JExpr.Type.Type>
  extends Pipeable.Pipeable, Referential.Referential {
  readonly _tag: Type["_tag"];

  readonly children: readonly TypeNode.Any[];

  readonly toType: (syntax: never) => Type;
}

/** The key under which a type expression keeps its type node. No public module exports it, so only the SDK reads the tree. */
export const Node: unique symbol = Symbol("~hashql/TypeNode");

export declare namespace TypeNode {
  export type Type<T> = T extends TypeNode<infer Type> ? Type : never;
  type TypeOf<T> = Type<T>;

  export interface Any extends TypeNode<JExpr.Type.Type> {}

  /** A type node whose `toType` takes one syntax per child, in the order of `children`. */
  export interface Of<
    Type extends JExpr.Type.Type,
    Children extends readonly Any[],
  > extends TypeNode<Type> {
    readonly children: Children;

    readonly toType: (syntax: {
      readonly [K in keyof Children]: TypeOf<Children[K]>;
    }) => Type;
  }
}

/**
 * Returns a type node's syntax.
 *
 * A node waiting for the syntax of its children waits on an array instead of the call stack, so memory rather than the stack limits how deep the type can nest.
 */
export const compile = (node: TypeNode.Any): JExpr.Type.Type =>
  fold(
    node,
    (node) => node.children,
    // SAFETY: `fold` passes one syntax per child, in the order of `children`, which is the tuple `TypeNode.Of` gives `toType`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fold fills the syntax one child at a time, so TypeScript cannot see that its length matches `children`
    (node, syntax: readonly JExpr.Type.Type[]) => node.toType(syntax as never),
  );
