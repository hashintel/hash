/**
 * Flattening scopes an item inside a component instance as
 * `instancePath::originalId`. These read and write that form.
 */

import type { ID } from "../../types/sdcpn";

export const scopeSeparator = "::";

const assertScopableId = (id: ID): void => {
  if (id.includes(scopeSeparator)) {
    throw new Error(
      `SDCPN IDs used with component instances must not contain the scope separator \`${scopeSeparator}\`: \`${id}\`.`,
    );
  }
};

export const scopedId = (path: readonly ID[], id: ID): ID => {
  for (const part of path) {
    assertScopableId(part);
  }
  assertScopableId(id);

  return path.length === 0 ? id : [...path, id].join(scopeSeparator);
};

/** Whether the item sits inside a component instance. */
export const isScopedId = (id: ID): boolean => id.includes(scopeSeparator);

/** How deep in the composition the item sits: 1 in the root net. */
export const scopeDepth = (id: ID): number => id.split(scopeSeparator).length;

/**
 * The id the item has in its own net. Compiled artifacts are keyed by it, and
 * two instances of one component share it.
 */
export const sourceItemId = (id: ID): ID => {
  const separatorIndex = id.lastIndexOf(scopeSeparator);
  return separatorIndex === -1
    ? id
    : id.slice(separatorIndex + scopeSeparator.length);
};
