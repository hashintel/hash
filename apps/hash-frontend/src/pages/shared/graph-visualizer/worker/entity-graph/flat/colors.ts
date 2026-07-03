/**
 * Cached colour resolution for entities and their type-set groups.
 *
 * Colours are pure functions of a type-set group, but resolving one walks the
 * group's type ids; callers on hot paths (style passes over every node) pass
 * a per-pass cache so each group is resolved once, not once per node.
 */
import {
  colorForType,
  edgeColorForType,
  FRONTIER_COLOR,
  primaryTypeOfSet,
} from "../../entity-style";

import type { Color } from "../../../frames";
import type { EntityIndex, TypeSetId } from "../../../ids";
import type { TypeRegistry } from "../../store/type-registry";
import type { EntityStore } from "../store/entity";
import type { TypeSetStore } from "../store/type-set";

export type ColorCache = Map<TypeSetId, Color>;

/** Node colour for a type-set group, keyed off the type's root. */
export function colorForTypeGroup(
  groupIdx: TypeSetId,
  cache: ColorCache,
  typeSets: TypeSetStore,
  types: TypeRegistry,
): Color {
  const cached = cache.get(groupIdx);
  if (cached) {
    return cached;
  }
  const group = typeSets.getById(groupIdx);
  const primary = group
    ? primaryTypeOfSet(group.directTypeIds, types)
    : undefined;
  const color = colorForType(primary, types);
  cache.set(groupIdx, color);
  return color;
}

/** Hierarchy-aware colour for an entity, cached per type-set group. */
export function colorForEntity(
  entityIdx: EntityIndex,
  cache: ColorCache,
  entities: EntityStore,
  typeSets: TypeSetStore,
  types: TypeRegistry,
): Color {
  // A frontier node (fetched, not yet expanded) reads greyed-out, whatever its type.
  if (!entities.isRoot(entityIdx)) {
    return FRONTIER_COLOR;
  }
  const groupIdx = entities.getTypeSet(entityIdx);
  if (groupIdx === -1) {
    return colorForType(undefined, types);
  }
  return colorForTypeGroup(groupIdx, cache, typeSets, types);
}

/** Edge colour for a link's type-set group, keyed off the link's own type
 * slot (not its root, since all link types share the `Link` root). */
export function edgeColorForTypeGroup(
  groupIdx: TypeSetId,
  cache: ColorCache,
  typeSets: TypeSetStore,
  types: TypeRegistry,
): Color {
  const cached = cache.get(groupIdx);
  if (cached) {
    return cached;
  }
  const group = typeSets.getById(groupIdx);
  const primary = group
    ? primaryTypeOfSet(group.directTypeIds, types)
    : undefined;
  const color = edgeColorForType(primary, types);
  cache.set(groupIdx, color);
  return color;
}
