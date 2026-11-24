/**
 * Finds the class a `this` expression belongs to, and whether it stands for an instance or for the class.
 */

import type { ESTree } from "@oxlint/plugins";

export interface ThisOwner {
  readonly body: ESTree.ClassBody;
  /** A static method's `this` is whatever class its caller names, which may be a subclass without the class's static private names. */
  readonly receiver: "instance" | "class" | "static method";
}

const methodOwner = (method: ESTree.Function): ThisOwner | null => {
  const { parent } = method;

  if (
    (parent.type === "MethodDefinition" ||
      parent.type === "TSAbstractMethodDefinition") &&
    parent.value === method &&
    parent.parent.type === "ClassBody"
  ) {
    const receiver = parent.static ? "static method" : "instance";
    return { body: parent.parent, receiver };
  }

  return null;
};

/** The class and context (static or instance) that `this` refers to at `node`. */
export const thisOwner = (node: ESTree.ThisExpression): ThisOwner | null => {
  let child: ESTree.Node = node;

  for (
    let current: ESTree.Node | null = node.parent;
    current !== null;
    current = current.parent
  ) {
    if (
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression"
    ) {
      return methodOwner(current);
    }

    if (current.type === "StaticBlock" && current.parent.type === "ClassBody") {
      return { body: current.parent, receiver: "class" };
    }

    // Only initializers use the class's `this`. Computed keys use the enclosing context.
    if (
      (current.type === "PropertyDefinition" ||
        current.type === "AccessorProperty") &&
      current.value === child &&
      current.parent.type === "ClassBody"
    ) {
      const receiver = current.static ? "class" : "instance";
      return { body: current.parent, receiver };
    }

    child = current;
  }

  return null;
};
