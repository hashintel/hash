import type * as JExpr from "../../JExpr/index.js";
import type { Pipeable } from "effect";

/**
 * A builder node that emits J-Expr syntax during expression serialization.
 *
 * A node describes one level of the syntax tree: its child nodes, and how their syntax combines into its own. {@link compile} walks the levels through an explicit stack, so serialization handles any nesting depth that fits in memory. Implement {@link Node.Of}, which ties the syntax `assemble` takes to `children`.
 */
export interface Node extends Pipeable.Pipeable {
  readonly children: readonly Node[];
  readonly toExpr: (syntax: never) => JExpr.Expression;
}

export declare namespace Node {
  /** A node whose `assemble` takes one syntax per child, in the order of `children`. */
  export interface Of<Children extends readonly Node[]> extends Node {
    readonly children: Children;

    /** Combines the syntax of the children without executing the represented HashQL expression. */
    readonly toExpr: (syntax: {
      readonly [K in keyof Children]: JExpr.Expression;
    }) => JExpr.Expression;
  }
}

interface Frame {
  readonly node: Node;
  readonly children: readonly Node[];
  readonly syntax: JExpr.Expression[];
}

const enter = (node: Node): Frame => ({
  node,
  children: node.children,
  syntax: [],
});

/**
 * Returns a node's syntax without executing the represented HashQL expression.
 *
 * A node waiting for the syntax of its children waits on an array instead of the call stack, so memory rather than the stack limits how deep the tree can nest.
 */
export const compile = (node: Node): JExpr.Expression => {
  const pending: Frame[] = [];
  let frame = enter(node);

  for (;;) {
    const child = frame.children[frame.syntax.length];

    if (child === undefined) {
      // SAFETY: `syntax` holds one entry per child, in the order of `children`, which is the tuple `Node.Of` gives `assemble`.
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
