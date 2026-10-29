import { Result, Schema, SchemaParser, pipe } from "effect";

import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";
import * as ProgramError from "../ProgramError.js";

import type { Pipeable } from "effect";

/**
 * A builder node that emits J-Expr syntax during expression serialization.
 *
 * A node describes one level of the syntax tree: its child nodes, and how their syntax combines into its own. {@link compile} walks the levels through an explicit stack, so serialization handles any nesting depth that fits in memory. Implement {@link Node.Of}, which ties the syntax `toExpr` takes to `children`.
 */
export interface Node<Name extends string>
  extends Pipeable.Pipeable, Referential.Referential {
  readonly _tag: Name;
  readonly children: readonly Node[];
  readonly toExpr: (syntax: never) => JExpr.Expression;
}

export declare namespace Node {
  export interface Any extends Node<string> {}

  /** A node whose `toExpr` takes one syntax per child, in the order of `children`. */
  export interface Of<
    Name extends string,
    Children extends readonly Node.Any[],
  > extends Node<Name> {
    readonly children: Children;

    /** Combines the syntax of the children without executing the represented HashQL expression. */
    readonly toExpr: (syntax: {
      readonly [K in keyof Children]: JExpr.Expression;
    }) => JExpr.Expression;
  }
}

interface Frame {
  readonly node: Node.Any;
  readonly children: readonly Node.Any[];
  readonly syntax: JExpr.Expression[];
}

const enter = (node: Node.Any): Frame => ({
  node,
  children: node.children,
  syntax: [],
});

/**
 * Returns a node's syntax without executing the represented HashQL expression.
 *
 * A node waiting for the syntax of its children waits on an array instead of the call stack, so memory rather than the stack limits how deep the tree can nest.
 */
export const compile = (node: Node.Any): JExpr.Expression => {
  const pending: Frame[] = [];
  let frame = enter(node);

  for (;;) {
    const child = frame.children[frame.syntax.length];

    if (child === undefined) {
      // SAFETY: `syntax` holds one entry per child, in the order of `children`, which is the tuple `Node.Of` gives `toExpr`.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the loop fills `syntax` one child at a time, so TypeScript cannot see that its length matches `children`
      const syntax = frame.node.toExpr(frame.syntax as never);
      const parent = pending.pop();

      if (parent === undefined) {
        return syntax;
      }

      parent.syntax.push(syntax);
      frame = parent;
    } else {
      pending.push(frame);
      frame = enter(child);
    }
  }
};

const parser = SchemaParser.decodeResult(Schema.toType(JExpr.Schema));

/**
 * Checks a node's syntax against the J-Expr schema and returns the node itself.
 *
 * A builder that assembles syntax from host values, such as a struct's field names or an input's name, validates its node here. Returning the node rather than the decoded syntax keeps the tree the builder made. A schema failure becomes a {@link ProgramError.Construction} with the `InvalidExpression` reason.
 */
export const validate = (
  node: Node,
): Result.Result<Node, ProgramError.Construction> =>
  pipe(
    node,
    compile,
    parser,
    Result.mapBoth({
      onSuccess: () => node,
      onFailure: (cause) => ProgramError.Construction.invalidExpression(cause),
    }),
  );
