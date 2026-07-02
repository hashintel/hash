/**
 * Resolves what an entity LOOKS like — display label, type icon, hover-card data,
 * incident-link degree — from the two entity sources: the prop `entities` (resolved
 * against the prop type maps) and frontier expansions (resolved against the maps each
 * expansion arrived with, held in the {@link FrontierExpansionStore}).
 */
import { useCallback, useMemo } from "react";

import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
} from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";

import type {
  EntityCardContext,
  FrontierExpansionStore,
} from "./frontier-expansion-store";
import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

interface UseEntityDisplayOptions {
  readonly entities: readonly HashEntity[] | undefined;
  readonly closedMultiEntityTypesRootMap:
    | ClosedMultiEntityTypesRootMap
    | undefined;
  readonly definitions: ClosedMultiEntityTypesDefinitions | undefined;
  /** Read imperatively (latest snapshot) by the Scene-facing resolvers. */
  readonly frontierStore: FrontierExpansionStore;
  /**
   * The render-committed expansion map, for everything that resolves DURING render
   * (`getCardContext`, `degreeById`) so renders stay consistent with one snapshot.
   */
  readonly expandedById: ReadonlyMap<EntityId, EntityCardContext>;
}

interface UseEntityDisplayResult {
  /**
   * The card data for an entity: the prop maps for a prop entity, else the expansion it
   * arrived in (a node a frontier expand revealed is not in the prop `entities`).
   * Undefined when the entity is held by neither source.
   */
  readonly getCardContext: (
    entityId: EntityId,
  ) => EntityCardContext | undefined;
  /**
   * Resolve a dot's entity to its display label (its name, e.g. "Alice"), the SAME way the
   * hover card does. WHICH dots are hubs (and so get an always-on label) is decided by the
   * Scene from the worker's by-degree radius, not here; this just names whatever it is asked
   * about. The Scene calls it only when it rebuilds the label set (zoom / structure change),
   * never per frame. Undefined on any miss (entity not held, or its closed type can't be
   * resolved) so the dot simply goes unlabelled.
   */
  readonly resolveEntityLabel: (entityId: EntityId) => string | undefined;
  /**
   * Resolve a dot's entity to its TYPE ICON as an atlas key -- the same display field the
   * hover card's icon uses (`getDisplayFieldsForClosedEntityType(...).icon`, which walks the
   * type hierarchy). The Scene calls this only when it rebuilds the flat-tier icon set (a
   * structure change), never per frame. Returns the key only when it's a non-empty STRING
   * (an emoji or an image URL); a ReactElement icon (system-type override) or none -> null ->
   * no atlas entry, so that dot simply shows no icon. NOT gated on hubs: the IconLayer's
   * soft-LOD sizing hides icons on dots that are small on screen, so every entity is eligible.
   */
  readonly resolveEntityIcon: (entityId: EntityId) => string | null;
  /**
   * Each entity's incident-link count (degree): a link entity carries both endpoints, so one
   * pass over the links tallies both sides. Counts the prop links AND the links pulled in by
   * frontier expansion -- the union the worker itself ingested -- so a hub enlarged by
   * expansion reports its true loaded degree, not just its prop-visible links.
   */
  readonly degreeById: ReadonlyMap<EntityId, number>;
}

export function useEntityDisplay({
  entities,
  closedMultiEntityTypesRootMap,
  definitions,
  frontierStore,
  expandedById,
}: UseEntityDisplayOptions): UseEntityDisplayResult {
  const entityById = useMemo(() => {
    const map = new Map<EntityId, HashEntity>();

    for (const entity of entities ?? []) {
      map.set(entity.metadata.recordId.entityId, entity);
    }

    return map;
  }, [entities]);

  const getCardContext = useCallback(
    (entityId: EntityId): EntityCardContext | undefined => {
      const propEntity = entityById.get(entityId);

      if (propEntity) {
        return {
          entity: propEntity,
          rootMap: closedMultiEntityTypesRootMap,
          definitions,
        };
      }

      return expandedById.get(entityId);
    },
    [entityById, closedMultiEntityTypesRootMap, definitions, expandedById],
  );

  // The Scene-facing lookup: identical two-source resolution, but against the store's LATEST
  // snapshot. The Scene invokes these between renders (on structure/zoom changes), so they
  // must see an expansion the moment it lands, not at the next commit.
  const lookupLatest = useCallback(
    (entityId: EntityId): EntityCardContext | undefined => {
      const propEntity = entityById.get(entityId);

      if (propEntity) {
        return {
          entity: propEntity,
          rootMap: closedMultiEntityTypesRootMap,
          definitions,
        };
      }

      return frontierStore.getSnapshot().expandedById.get(entityId);
    },
    [entityById, closedMultiEntityTypesRootMap, definitions, frontierStore],
  );

  const resolveEntityLabel = useCallback(
    (entityId: EntityId): string | undefined => {
      const context = lookupLatest(entityId);
      if (!context || !context.rootMap) {
        return undefined;
      }

      try {
        const closedType = getClosedMultiEntityTypeFromMap(
          context.rootMap,
          context.entity.metadata.entityTypeIds,
        );

        return generateEntityLabel(closedType, context.entity);
      } catch (exception) {
        // eslint-disable-next-line no-console
        console.warn("Unable to resolve entity label", entityId, exception);

        return undefined;
      }
    },
    [lookupLatest],
  );

  // Icon resolution walks the type hierarchy; memo by type-set key so each distinct set
  // resolves once. The cache resets when the root map changes. Mutated only from
  // resolveEntityIcon, which the Scene calls imperatively (never during a render).
  const iconByTypeKey = useMemo(() => {
    void closedMultiEntityTypesRootMap;
    return new Map<string, string | null>();
  }, [closedMultiEntityTypesRootMap]);

  const resolveEntityIcon = useCallback(
    (entityId: EntityId): string | null => {
      const context = lookupLatest(entityId);
      if (!context || !context.rootMap) {
        return null;
      }

      const typeKey = [...context.entity.metadata.entityTypeIds]
        .sort()
        .join("\u0000");

      const cached = iconByTypeKey.get(typeKey);
      if (cached !== undefined) {
        return cached;
      }

      let resolved: string | null;
      try {
        const closedType = getClosedMultiEntityTypeFromMap(
          context.rootMap,
          context.entity.metadata.entityTypeIds,
        );
        const { icon } = getDisplayFieldsForClosedEntityType(closedType);
        resolved = typeof icon === "string" && icon.length > 0 ? icon : null;
      } catch (exception) {
        // eslint-disable-next-line no-console
        console.warn("Unable to resolve entity icon", entityId, exception);

        resolved = null;
      }

      iconByTypeKey.set(typeKey, resolved);
      return resolved;
    },
    [lookupLatest, iconByTypeKey],
  );

  const degreeById = useMemo(() => {
    const map = new Map<EntityId, number>();

    const tally = (entity: HashEntity): void => {
      const { linkData } = entity;
      if (!linkData) {
        return;
      }

      map.set(linkData.leftEntityId, (map.get(linkData.leftEntityId) ?? 0) + 1);
      map.set(
        linkData.rightEntityId,
        (map.get(linkData.rightEntityId) ?? 0) + 1,
      );
    };

    for (const entity of entities ?? []) {
      tally(entity);
    }

    for (const context of expandedById.values()) {
      tally(context.entity);
    }

    return map;
  }, [entities, expandedById]);

  return { getCardContext, resolveEntityLabel, resolveEntityIcon, degreeById };
}
