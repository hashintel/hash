/**
 * Used to ensure the node is a child of the given parent.
 *
 * @returns True if noop.
 */
export const ensureMounted = <T extends Node>(child: T, parent: Element) => {
  if (child.parentNode === parent) {
    return true;
  }
  parent.appendChild(child);

  return false;
};
