import { Array, Function } from "effect";
import {
  ModifierFlags,
  isIdentifier,
  isPrivateIdentifier,
} from "typescript/ast";
import {
  getCombinedModifierFlags,
  getNameOfDeclaration,
} from "typescript/ast/utils";

import type { Declaration, Identifier, Node, NodeFlags } from "typescript/ast";

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

/** Whether a class keeps `member` to itself, as a `private` member or one named with `#`. */
export const isPrivate = (member: Declaration): boolean => {
  const name = getNameOfDeclaration(member);

  return (
    hasModifier(member, ModifierFlags.Private) ||
    (name !== undefined && isPrivateIdentifier(name))
  );
};

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
