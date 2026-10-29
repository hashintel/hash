import { Array, Result, Schema, SchemaParser, pipe } from "effect";

import { fold } from "../../internal/fold.js";
import * as JExpr from "../../JExpr/index.js";
import * as ProgramError from "../ProgramError.js";
import * as TAST from "../TAST/index.js";

import type * as Referential from "../../internal/referential.js";
import type { TypeNode } from "../TAST/TypeNode.js";
import type { Pipeable } from "effect";

/**
 * A builder node that emits J-Expr syntax during expression serialization.
 *
 * A node describes one level of the syntax tree, and how the syntax of its type annotations and child nodes combines into its own. It keeps the ids of the bindings its own syntax names under {@link Referential.References}. {@link compile} walks the levels through an explicit stack, so serialization handles any nesting depth that fits in memory. Implement {@link Node.Of}, which ties the syntax `toExpr` takes to `types` and `children`.
 */
export interface Node<Name extends string, Expr extends JExpr.Expression>
  extends Pipeable.Pipeable, Referential.Referential {
  readonly _tag: Name;

  /** The types the node's syntax annotates or declares, such as an input's type. */
  readonly types: readonly TypeNode.Any[];
  readonly children: readonly Node.Any[];
  readonly toExpr: (types: never, children: never) => Expr;
}

export declare namespace Node {
  export type Expr<N> = N extends Node<infer _Name, infer Expr> ? Expr : never;
  type ExprOf<N> = Expr<N>;

  export interface Any extends Node<string, JExpr.Expression> {}

  /** A node whose `toExpr` takes one syntax per type node and one per child, in the order of `types` and `children`. */
  export interface Of<
    Name extends string,
    Expr extends JExpr.Expression,
    Types extends readonly TypeNode.Any[],
    Children extends readonly Any[],
  > extends Node<Name, Expr> {
    readonly types: Types;
    readonly children: Children;

    /** Combines the syntax of the children without executing the represented HashQL expression. */
    readonly toExpr: (
      types: {
        readonly [K in keyof Types]: TypeNode.Type<Types[K]>;
      },
      children: {
        readonly [K in keyof Children]: ExprOf<Children[K]>;
      },
    ) => Expr;
  }
}

/**
 * Returns a node's syntax without executing the represented HashQL expression.
 *
 * A node waiting for the syntax of its children waits on an array instead of the call stack, so memory rather than the stack limits how deep the tree can nest.
 */
export const compile = (node: Node.Any): JExpr.Expression =>
  fold(
    node,
    (node) => node.children,
    (node, syntax: readonly JExpr.Expression[]) => {
      const types = Array.map(node.types, TAST.compile);

      // SAFETY: `fold` passes one syntax per child, in the order of `children`, and `types` holds one syntax per type node, in the order of `types`. Those are the tuples `Node.Of` gives `toExpr`.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fold fills the syntax one child at a time, so TypeScript cannot see that its lengths match `types` and `children`
      return node.toExpr(types as never, syntax as never);
    },
  );

const parser = SchemaParser.decodeResult(Schema.toType(JExpr.Schema));

/**
 * Checks a node's syntax against the J-Expr schema and returns the node itself.
 *
 * A builder that assembles syntax from host values, such as a struct's field names or an input's name, validates its node here. Returning the node rather than the decoded syntax keeps the tree the builder made. A schema failure becomes a {@link ProgramError.Construction} with the `InvalidExpression` reason.
 */
export const validate = (
  node: Node.Any,
): Result.Result<Node.Any, ProgramError.Construction> =>
  pipe(
    node,
    compile,
    parser,
    Result.mapBoth({
      onSuccess: () => node,
      onFailure: (cause) => ProgramError.Construction.invalidExpression(cause),
    }),
  );
