/**
 * Builds a {@link FeatureSource} over worker stores for
 * {@link nameClustersByDistinctiveFeatures}.
 *
 * Feature keys are namespaced strings (`p`/`lt`/`n` + NUL-separated fields);
 * this module decodes them in {@link FeatureSource.describe}.
 */
import { primaryTypeOfSet } from "../entity-style";

import type { EntityIndex, TypeId } from "../../ids";
import type { EntityStore } from "../entity-graph/store/entity";
import type { LinkStore } from "../entity-graph/store/link";
import type { PropertyStore } from "../entity-graph/store/property";
import type { TypeRegistry } from "../store/type-registry";
import type { TypeSetStore } from "../entity-graph/store/type-set";
import type {
  FeatureDescriptor,
  FeatureSource,
  NumericDimension,
  NumericReading,
} from "./distinctive-cluster-label";

export interface ClusterFeatureDependencies {
  readonly properties: PropertyStore;
  readonly links: LinkStore;
  readonly entities: EntityStore;
  readonly typeSets: TypeSetStore;
  readonly types: TypeRegistry;
}

/** Sorts link parts after property/range parts (which sort by their human title). */
const LINK_SORT_PREFIX = "\uFFFF";

/**
 * Returns a {@link FeatureSource} backed by the worker's property, link,
 * entity, type-set, and type stores.
 *
 * Keys are opaque to the namer; {@link FeatureSource.describe} and
 * {@link FeatureSource.describeNumeric} decode them for display. Link
 * features require a resolvable target type; members without one are
 * skipped.
 */
export function createClusterFeatureSource(
  dependencies: ClusterFeatureDependencies,
): FeatureSource {
  const { properties, links, entities, typeSets, types } = dependencies;

  /** The primary (most specific) type of the entity an endpoint points at, if known. */
  const targetTypeIdx = (otherIdx: EntityIndex): TypeId | undefined => {
    const groupIdx = entities.getTypeSet(otherIdx);
    if (groupIdx === -1) {
      return undefined;
    }
    const group = typeSets.getById(groupIdx);
    if (!group) {
      return undefined;
    }
    return primaryTypeOfSet(group.directTypeIds, types);
  };

  return {
    *keysOf(member: EntityIndex): Iterable<string> {
      const features = properties.featuresOf(member);
      if (features) {
        for (const featureIdx of features) {
          yield `p\u0000${featureIdx}`;
        }
      }
      for (const link of links.linksFor(member)) {
        const typeIdx = targetTypeIdx(link.otherId);
        if (typeIdx === undefined) {
          continue;
        }
        yield `lt\u0000${link.direction}\u0000${typeIdx}`;
      }
    },

    *numericsOf(member: EntityIndex): Iterable<NumericReading> {
      const keys = properties.numericKeysOf(member);
      const values = properties.numericValuesOf(member);
      if (!keys || !values) {
        return;
      }
      // keys and values are parallel arrays of equal length from the same member.
      for (let index = 0; index < keys.length; index++) {
        yield { dimension: `n\u0000${keys[index]!}`, value: values[index]! };
      }
    },

    describe(key: string): FeatureDescriptor | undefined {
      const parts = key.split("\u0000");
      if (parts[0] === "p") {
        const info = properties.describe(Number(parts[1]));
        if (!info) {
          return undefined;
        }
        return {
          group: `prop\u0000${info.baseUrl}`,
          text: `${info.title} = ${info.display}`,
          sortKey: info.title,
        };
      }
      if (parts[0] === "lt") {
        const direction = parts[1];
        // parts[2] is the type index encoded when the key was built from a
        // resolved target type.
        const info = types.get(Number(parts[2]) as TypeId);
        if (!info) {
          return undefined;
        }
        const arrow = direction === "out" ? "→" : "←";
        return {
          group: key,
          text: `${arrow} ${info.title}`,
          sortKey: `${LINK_SORT_PREFIX}${direction}\u0000${info.title}`,
        };
      }
      return undefined;
    },

    describeNumeric(dimension: string): NumericDimension | undefined {
      const keyIdx = Number(dimension.split("\u0000")[1]);
      const baseUrl = properties.numericBaseUrl(keyIdx);
      if (baseUrl === undefined) {
        return undefined;
      }
      const title = properties.title(baseUrl);
      return {
        group: `prop\u0000${baseUrl}`,
        title,
        kind: properties.numericKind(keyIdx),
        sortKey: title,
      };
    },
  };
}
