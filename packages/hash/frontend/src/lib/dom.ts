/**
 * used to ensure the node is a child of the given parent
 * @returns true if noop
 */
export const ensureMounted = <T extends Node>(child: T, parent: Element) => {
  if (child.parentNode === parent) return true;
  parent.appendChild(child);
  return false;
};

/** @returns whether or not it's an element node */
export const isElement = (node: Node): node is Element => node.nodeType === 1;

/** @returns the first parent node `predicate` returns truthy for */
export const findParent = (
  node: Node | null | undefined,
  predicate: (el: Element) => boolean,
) => {
  let el = !node ? null : isElement(node) ? node : node.parentElement;
  while (el && !predicate(el)) el = el.parentElement;
  return el;
};
