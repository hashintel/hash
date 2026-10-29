/**
 * Handles that name a binding, and the check that each still names that binding where the program uses it.
 *
 * HashQL resolves a bare name to the innermost binding of that name, so a handle that emits `v` means whichever `v` encloses it. A {@link Reference} remembers which value binding it came from, and a {@link TypeSyntax} remembers the type bindings its names came from. {@link resolveReferences} walks a finished tree with HashQL's scope rules and fails where a name would resolve to a different binding.
 *
 * @module
 */
import { Array, Pipeable, Predicate, Result } from "effect";

import * as Ident from "../../JExpr/Ident.js";
import * as ProgramError from "../ProgramError.js";
import { isLet } from "./Let.js";
import { isNewtype } from "./Newtype.js";
import { isType } from "./Type.js";

import type * as JExpr from "../../JExpr/index.js";
import type * as Syntax from "../../JExpr/Type/index.js";
import type * as TypeExpression from "../TypeExpression.js";
import type { Node } from "./Node.js";

/** HashQL keeps one scope for value names and another for type names, so a type binding never shadows a value of the same name. */
export type Universe = "value" | "type";

/**
 * Identifies one binding by the program that made it, its universe, the name it binds and its generation.
 *
 * The generation counts the earlier bindings of the same name in the same universe and program. Ids whose fields agree name the same binding, so a copied handle still names its binding.
 */
export interface ReferenceId {
  readonly draft: symbol;
  readonly universe: Universe;
  readonly ident: Ident.Ident;
  readonly generation: number;
}

/** Type syntax and the ids of the type bindings whose names it emits. */
export interface TypeSyntax {
  readonly syntax: Syntax.Type;
  readonly references: readonly ReferenceId[];
}

/**
 * The key under which a node or a type handle keeps the ids of the bindings its own syntax names.
 *
 * No public type declares it, so the check stays inside the SDK. A node's ids exclude its children's, and a type handle's are those of every name its syntax emits.
 */
export const References: unique symbol = Symbol("~hashql/References");

/** What keeps ids under {@link References}: a node, or a type handle a Draft built. */
type Carrier = Node | TypeExpression.TypeExpression.Any;

interface Referencing {
  readonly [References]: readonly ReferenceId[];
}

// Only the SDK can name the key, and it stores ids under it alone.
const isReferencing = <C extends Carrier>(value: C): value is C & Referencing =>
  Predicate.hasProperty(value, References);

/** Reads the ids a node or a type handle keeps under {@link References}, or none for one built without a Draft. */
export const referencesOf = (value: Carrier): readonly ReferenceId[] =>
  isReferencing(value) ? value[References] : [];

export class Reference extends Pipeable.Class implements Node.Of<readonly []> {
  readonly id: ReferenceId;
  readonly children: readonly [] = [];

  constructor(id: ReferenceId) {
    super();

    this.id = id;
  }

  get [References](): readonly [ReferenceId] {
    return [this.id];
  }

  toExpr(): JExpr.Expression {
    return Ident.compile(this.id.ident);
  }
}

type Task =
  | { readonly _tag: "Visit"; readonly node: Node }
  | { readonly _tag: "Enter"; readonly binding: ReferenceId }
  | { readonly _tag: "Leave"; readonly binding: ReferenceId }
  | { readonly _tag: "Resolve"; readonly reference: ReferenceId };

const visit = (node: Node): Task => ({ _tag: "Visit", node });
const enter = (binding: ReferenceId): Task => ({ _tag: "Enter", binding });
const leave = (binding: ReferenceId): Task => ({ _tag: "Leave", binding });
const resolve = (reference: ReferenceId): Task => ({
  _tag: "Resolve",
  reference,
});

const key = ({ universe, ident }: ReferenceId): string =>
  `${universe} ${Ident.compile(ident)}`;

/** One node's steps in order, with the scope each binding has in HashQL's name resolution. */
const steps = (node: Node): readonly Task[] => {
  // A let's value does not see its own binding, so `let n = add(n, 1)` reads the enclosing `n`.
  if (isLet(node)) {
    return [
      visit(node.binding.value),
      enter(node.id),
      visit(node.child),
      leave(node.id),
    ];
  }

  // A type's definition sees its own binding, so `type T = (T, String)` is recursive.
  if (isType(node)) {
    return [
      enter(node.id),
      ...Array.map(node.binding.value.references, resolve),
      visit(node.child),
      leave(node.id),
    ];
  }

  // The type is in scope in its definition and its body, and the constructor in the body alone.
  if (isNewtype(node)) {
    return [
      enter(node.ids.type),
      ...Array.map(node.binding.value.references, resolve),
      enter(node.ids.value),
      visit(node.child),
      leave(node.ids.value),
      leave(node.ids.type),
    ];
  }

  return [
    ...Array.map(referencesOf(node), resolve),
    ...Array.map(node.children, visit),
  ];
};

/**
 * Checks that every reference in a finished tree resolves to the binding it came from.
 *
 * Run it on a program's root, where every binding encloses the uses it can reach. A value or type reference fails with the `StaleReference` reason when a later binding of its name shadows it, when its binding is in another program, or when its binding is in a branch that does not enclose it. The walk keeps its pending steps in an array, so the check handles any nesting depth that fits in memory, as `compile` does.
 */
export const resolveReferences = (
  root: Node,
): Result.Result<Node, ProgramError.Construction> => {
  const scope = new Map<string, ReferenceId[]>();
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
          innermost?.draft !== reference.draft ||
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
