import { Array, Function } from "effect";
import { isIdentifier } from "typescript/ast";
import { getCombinedModifierFlags } from "typescript/ast/utils";

import type {
  Declaration,
  Identifier,
  ModifierFlags,
  Node,
  NodeFlags,
} from "typescript/ast";

export type { Node } from "typescript/ast";

/** Whether `node` carries `flag`, one of the compiler's node flags. */
export const hasFlag: {
  (flag: NodeFlags): (node: Node) => boolean;
  (node: Node, flag: NodeFlags): boolean;
} = Function.dual(
  2,
  (node: Node, flag: NodeFlags): boolean =>
    // oxlint-disable-next-line no-bitwise -- `NodeFlags` is the compiler's bit set.
    (node.flags & flag) !== 0,
);

/** Whether `declaration` carries `modifier`, one of the compiler's modifier flags. */
export const hasModifier: {
  (modifier: ModifierFlags): (declaration: Declaration) => boolean;
  (declaration: Declaration, modifier: ModifierFlags): boolean;
} = Function.dual(
  2,
  (declaration: Declaration, modifier: ModifierFlags): boolean =>
    // oxlint-disable-next-line no-bitwise -- `ModifierFlags` is the compiler's bit set.
    (getCombinedModifierFlags(declaration) & modifier) !== 0,
);

/** Walks identifier occurrences, retaining repeated and shadowed names in syntax order. */
export const identifiers = (node: Node): readonly Identifier[] => {
  const found: Identifier[] = [];
  const pending = [node];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current !== undefined) {
      if (isIdentifier(current)) {
        found.push(current);
      }

      pending.push(...Array.fromIterable(current.childrenIter()).toReversed());
    }
  }

  return found;
};
