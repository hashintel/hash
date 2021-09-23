/**
 * used to ensure the node is a child of the given parent
 * @returns true if noop
 */
export const ensureMounted = <T extends Node>(child: T, parent: Element) =>
  child.parentNode === parent || (parent.appendChild(child), false);
