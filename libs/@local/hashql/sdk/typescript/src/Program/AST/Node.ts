// oxlint-disable import/max-dependencies -- `resolveReferences` reads the scope rule of every node that binds a name
import { Array, Result, Schema, SchemaParser, pipe } from "effect";

import { fold } from "../../internal/fold.js";
import * as Referential from "../../internal/referential.js";
import * as JExpr from "../../JExpr/index.js";
import * as ProgramError from "../ProgramError.js";
import * as TAST from "../TAST/index.js";
import { isClosure } from "./Closure.js";
import { isImport } from "./Import.js";
import { isLet } from "./Let.js";
import { isNewtype } from "./Newtype.js";
import { isType } from "./Type.js";

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
  readonly types: readonly TAST.TypeNode.Any[];
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
    Types extends readonly TAST.TypeNode.Any[],
    Children extends readonly Any[],
  > extends Node<Name, Expr> {
    readonly types: Types;
    readonly children: Children;

    /** Combines the syntax of the children without executing the represented HashQL expression. */
    readonly toExpr: (
      types: {
        readonly [K in keyof Types]: TAST.TypeNode.Type<Types[K]>;
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

type Task =
  | { readonly _tag: "Visit"; readonly node: Node.Any }
  | { readonly _tag: "VisitType"; readonly node: TAST.TypeNode.Any }
  | { readonly _tag: "Enter"; readonly binding: Referential.ReferenceId }
  | { readonly _tag: "Leave"; readonly binding: Referential.ReferenceId }
  | { readonly _tag: "Resolve"; readonly reference: Referential.ReferenceId };

const visit = (node: Node.Any): Task => ({ _tag: "Visit", node });
const visitType = (node: TAST.TypeNode.Any): Task => ({
  _tag: "VisitType",
  node,
});
const enter = (binding: Referential.ReferenceId): Task => ({
  _tag: "Enter",
  binding,
});
const leave = (binding: Referential.ReferenceId): Task => ({
  _tag: "Leave",
  binding,
});
const resolve = (reference: Referential.ReferenceId): Task => ({
  _tag: "Resolve",
  reference,
});

const key = ({ universe, name }: Referential.ReferenceId): string =>
  `${universe} ${name}`;

/** One node's steps in order, with the scope each binding has in HashQL's name resolution. */
const steps = (node: Node.Any): readonly Task[] => {
  // A let's value does not see its own binding, so `let n = add(n, 1)` reads the enclosing `n`. Its annotation names types from the scope around the let.
  if (isLet(node)) {
    return [
      visit(node.binding.value),
      ...Array.map(node.types, visitType),
      enter(node.binding.id),
      visit(node.child),
      leave(node.binding.id),
    ];
  }

  // An import's path resolves outside it, and the names it binds are in scope in its body alone.
  if (isImport(node)) {
    return [
      visit(node.path),
      ...Array.map(node.bindings, enter),
      visit(node.child),
      ...Array.map(node.bindings.toReversed(), leave),
    ];
  }

  // A type's definition sees its own binding, so `type T = (T, String)` is recursive.
  if (isType(node)) {
    return [
      enter(node.binding.id),
      visitType(node.binding.value),
      visit(node.child),
      leave(node.binding.id),
    ];
  }

  // The type is in scope in its definition and its body, and the constructor in the body alone.
  if (isNewtype(node)) {
    return [
      enter(node.binding.id),
      visitType(node.binding.value),
      enter(node.valueReference),
      visit(node.child),
      leave(node.valueReference),
      leave(node.binding.id),
    ];
  }

  // `fn` binds every type parameter before it reads a bound, so the type parameters are in scope in each other's bounds, the signature and the body. The parameters are in scope in the body alone.
  if (isClosure(node)) {
    const { generics, parameters, returns } = node.signature;

    return [
      ...Array.map(generics, ({ id }) => enter(id)),
      ...Array.map(generics, ({ bound }) => visitType(bound)),
      ...Array.map(parameters, ({ type }) => visitType(type)),
      visitType(returns),
      ...Array.map(parameters, ({ id }) => enter(id)),
      visit(node.child),
      ...Array.map(parameters.toReversed(), ({ id }) => leave(id)),
      ...Array.map(generics.toReversed(), ({ id }) => leave(id)),
    ];
  }

  return [
    ...Array.map(node[Referential.References], resolve),
    ...Array.map(node.types, visitType),
    ...Array.map(node.children, visit),
  ];
};

const typeSteps = (node: TAST.TypeNode.Any): readonly Task[] => [
  ...Array.map(node[Referential.References], resolve),
  ...Array.map(node.children, visitType),
];

/**
 * Checks that every reference in a finished tree resolves to the binding it came from.
 *
 * HashQL resolves a bare name to the innermost binding of that name, so a handle that emits `v` means whichever `v` encloses it. The check walks the tree with HashQL's scope rules and compares each id a node or a type node keeps under {@link Referential.References} with the binding its name would resolve to there. Run it on a program's root, where every binding encloses the uses it can reach. A value or type reference fails with the `StaleReference` reason when a later binding of its name shadows it, when its binding is in another program, or when its binding is in a branch or a closure that does not enclose it. The walk keeps its pending steps in an array, so the check handles any nesting depth that fits in memory, as `compile` does.
 */
export const resolveReferences = (
  root: Node.Any,
): Result.Result<Node.Any, ProgramError.Construction> => {
  const scope = new Map<string, Referential.ReferenceId[]>();
  const pending: Task[] = [visit(root)];

  for (let task = pending.pop(); task !== undefined; task = pending.pop()) {
    switch (task._tag) {
      case "Visit": {
        // One push per step, because spreading a node's children into one call has an argument limit.
        for (const step of steps(task.node).toReversed()) {
          pending.push(step);
        }
        break;
      }
      case "VisitType": {
        for (const step of typeSteps(task.node).toReversed()) {
          pending.push(step);
        }
        break;
      }
      case "Enter": {
        const bindings = scope.get(key(task.binding));
        if (bindings === undefined) {
          scope.set(key(task.binding), [task.binding]);
        } else {
          bindings.push(task.binding);
        }
        break;
      }
      case "Leave": {
        scope.get(key(task.binding))?.pop();
        break;
      }
      case "Resolve": {
        const { reference } = task;
        const innermost = scope.get(key(reference))?.at(-1);
        if (
          innermost?.source !== reference.source ||
          innermost.generation !== reference.generation
        ) {
          return Result.fail(
            ProgramError.Construction.staleReference(
              JExpr.Ident.compile(reference.ident),
            ),
          );
        }
        break;
      }
    }
  }

  return Result.succeed(root);
};
