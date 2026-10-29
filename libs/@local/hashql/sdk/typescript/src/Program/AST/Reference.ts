/**
 * The check that each handle still names its own binding where the program uses it.
 *
 * HashQL resolves a bare name to the innermost binding of that name, so a handle that emits `v` means whichever `v` encloses it. A node or a type node keeps the ids of the bindings its own syntax names under {@link Referential.References}. {@link resolveReferences} walks a finished tree with HashQL's scope rules and fails where a name would resolve to a different binding.
 *
 * @module
 */
import { Array, Result } from "effect";

import * as Referential from "../../internal/referential.js";
import * as Ident from "../../JExpr/Ident.js";
import * as ProgramError from "../ProgramError.js";
import { isLet } from "./Let.js";
import { isNewtype } from "./Newtype.js";
import { isType } from "./Type.js";

import type { TypeNode } from "../TAST/TypeNode.js";
import type { Node } from "./Node.js";

type Task =
  | { readonly _tag: "Visit"; readonly node: Node.Any }
  | { readonly _tag: "VisitType"; readonly node: TypeNode.Any }
  | { readonly _tag: "Enter"; readonly binding: Referential.ReferenceId }
  | { readonly _tag: "Leave"; readonly binding: Referential.ReferenceId }
  | { readonly _tag: "Resolve"; readonly reference: Referential.ReferenceId };

const visit = (node: Node.Any): Task => ({ _tag: "Visit", node });
const visitType = (node: TypeNode.Any): Task => ({ _tag: "VisitType", node });
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

const key = ({ universe, ident }: Referential.ReferenceId): string =>
  `${universe} ${Ident.compile(ident)}`;

/** One node's steps in order, with the scope each binding has in HashQL's name resolution. */
const steps = (node: Node.Any): readonly Task[] => {
  // A let's value does not see its own binding, so `let n = add(n, 1)` reads the enclosing `n`.
  if (isLet(node)) {
    return [
      visit(node.binding.value),
      enter(node.binding.id),
      visit(node.child),
      leave(node.binding.id),
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

  return [
    ...Array.map(node[Referential.References], resolve),
    ...Array.map(node.types, visitType),
    ...Array.map(node.children, visit),
  ];
};

const typeSteps = (node: TypeNode.Any): readonly Task[] => [
  ...Array.map(node[Referential.References], resolve),
  ...Array.map(node.children, visitType),
];

/**
 * Checks that every reference in a finished tree resolves to the binding it came from.
 *
 * Run it on a program's root, where every binding encloses the uses it can reach. A value or type reference fails with the `StaleReference` reason when a later binding of its name shadows it, when its binding is in another program, or when its binding is in a branch that does not enclose it. The walk keeps its pending steps in an array, so the check handles any nesting depth that fits in memory, as `compile` does.
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
              Ident.compile(reference.ident),
            ),
          );
        }
        break;
      }
    }
  }

  return Result.succeed(root);
};
