/**
 * Scoped entity ids for component instances.
 *
 * When a net containing component instances is flattened for simulation,
 * every subnet entity id is rewritten to `instanceId::entityId`, with nested
 * instances giving `outer::inner::entityId`. Simulation frames, firing
 * records, and status-view place references all use these ids, so parsing
 * and formatting live here rather than being re-derived from the string
 * shape at each consumer.
 */

import type { ID } from "./types/sdcpn";

export const SCOPED_ID_SEPARATOR = "::";

const assertScopableId = (id: ID): void => {
  if (id.includes(SCOPED_ID_SEPARATOR)) {
    throw new Error(
      `SDCPN IDs used with component instances must not contain the scope separator \`${SCOPED_ID_SEPARATOR}\`: \`${id}\`.`,
    );
  }
};

/**
 * Formats an entity id under a component-instance path. An empty path
 * returns the id unchanged (a root-net entity). Throws when any segment
 * already contains the separator, since such an id cannot be parsed back.
 */
export const formatScopedId = (
  instancePath: readonly ID[],
  entityId: ID,
): ID => {
  for (const instanceId of instancePath) {
    assertScopableId(instanceId);
  }
  assertScopableId(entityId);

  return instancePath.length === 0
    ? entityId
    : [...instancePath, entityId].join(SCOPED_ID_SEPARATOR);
};

export type ParsedScopedId = {
  /**
   * Component-instance ids from outermost to innermost. Empty for a
   * root-net entity id.
   */
  instancePath: ID[];
  /** The entity's id within its defining net. */
  entityId: ID;
};

/**
 * Splits a (possibly) scoped id into its component-instance path and the
 * entity id within the defining net. An unscoped id parses to an empty path.
 */
export const parseScopedId = (scopedId: ID): ParsedScopedId => {
  const segments = scopedId.split(SCOPED_ID_SEPARATOR);
  const entityId = segments[segments.length - 1] ?? scopedId;
  return { instancePath: segments.slice(0, -1), entityId };
};

/** Whether an id addresses an entity inside a component instance. */
export const isScopedId = (id: ID): boolean => id.includes(SCOPED_ID_SEPARATOR);
