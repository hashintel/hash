import type { ReactElement, ReactNode } from "react";

const isReactElement = (variable: unknown): variable is ReactElement => {
  return variable instanceof Object && "$$typeof" in variable;
};

export const stringifyChildren = (node: ReactNode): string => {
  if (typeof node === "string") {
    return node;
  } else if (Array.isArray(node)) {
    return node.map(stringifyChildren).join("");
  } else if (isReactElement(node)) {
    return stringifyChildren(node.props.children as ReactNode);
  }
  return "";
};
