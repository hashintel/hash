import { getEntityTypeById } from "@blockprotocol/graph/stdlib";
import { isEntityId, validateVersionedUrl } from "@blockprotocol/type-system";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { queryEntityTypeSubgraph } from "@local/hash-graph-sdk/entity-type";
import {
  conditionLeaves,
  validateCondition,
} from "@local/hash-isomorphic-utils/flows/filter-condition";
import { maxEntitiesPerStep } from "@local/hash-isomorphic-utils/flows/limits";
import {
  currentTimeInstantTemporalAxes,
  generateEntityEditionFilter,
} from "@local/hash-isomorphic-utils/graph-queries";

import { graphApiClient } from "../../shared/graph-api-client.js";

import type {
  ConditionContext,
  ConditionEntity,
} from "./evaluate-condition.js";
import type { Subgraph } from "@blockprotocol/graph";
import type {
  EntityId,
  UserId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { EntityQueryCursor, Filter } from "@local/hash-graph-client";
import type {
  ConditionSubject,
  FilterCondition,
} from "@local/hash-isomorphic-utils/flows/filter-condition";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

/**
 * What a condition reads from an item of `kind`: the subjects of its leaves, and whether any of them needs the
 * ancestors of the entities' types. Nothing for an invalid condition, whose evaluation reports the error.
 */
export const getConditionReads = (
  condition: FilterCondition,
  kind: PayloadKind,
): { subjects: ConditionSubject[]; includeSubtypes: boolean } => {
  if (validateCondition(condition, kind)) {
    return { subjects: [], includeSubtypes: false };
  }
  const leaves = conditionLeaves(condition);
  return {
    subjects: leaves.map(({ subject }) => subject),
    includeSubtypes: leaves.some(
      (leaf) => leaf.operator === "isOfType" && leaf.includeSubtypes,
    ),
  };
};

const getEntities = async (
  authentication: { actorId: UserId },
  values: readonly unknown[],
): Promise<Map<EntityId, ConditionEntity> | undefined> => {
  const entityIds = [
    ...new Set(
      values.filter(
        (value): value is EntityId =>
          typeof value === "string" && isEntityId(value),
      ),
    ),
  ];

  if (entityIds.length === 0) {
    return undefined;
  }

  if (entityIds.length > maxEntitiesPerStep) {
    throw new Error(
      `A condition can read at most ${maxEntitiesPerStep} entities, but was given ${entityIds.length}.`,
    );
  }

  const filter: Filter = { any: entityIds.map(generateEntityEditionFilter) };

  const entities = new Map<EntityId, ConditionEntity>();
  let cursor: EntityQueryCursor | null | undefined;

  do {
    const response = await queryEntities(
      { graphApi: graphApiClient },
      authentication,
      {
        filter,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: true,
        includePermissions: false,
        cursor,
      },
    );

    for (const entity of response.entities) {
      entities.set(entity.metadata.recordId.entityId, {
        properties: entity.properties,
        entityTypeIds: entity.metadata.entityTypeIds,
      });
    }
    cursor = response.cursor;
  } while (cursor);

  return entities;
};

/** The types `entityTypeId` inherits from, or nothing if it or any of them isn't in the subgraph. */
const getAncestorIds = (
  subgraph: Subgraph,
  entityTypeId: VersionedUrl,
): VersionedUrl[] | undefined => {
  const entityType = getEntityTypeById(subgraph, entityTypeId);
  if (!entityType) {
    return undefined;
  }

  const ancestorIds: VersionedUrl[] = [];
  for (const { $ref } of entityType.schema.allOf ?? []) {
    const parentAncestorIds = getAncestorIds(subgraph, $ref);
    if (!parentAncestorIds) {
      return undefined;
    }
    ancestorIds.push($ref, ...parentAncestorIds);
  }
  return ancestorIds;
};

/**
 * A type the user can't read, or that inherits from one they can't, is left out, so a condition that needs its
 * ancestors fails rather than matching.
 */
const getEntityTypeAncestors = async (
  authentication: { actorId: UserId },
  entities: readonly unknown[],
): Promise<Map<VersionedUrl, VersionedUrl[]> | undefined> => {
  const entityTypeIds = [
    ...new Set(
      entities.flatMap((entity) => {
        const typeIds: unknown =
          typeof entity === "object" && entity !== null
            ? (entity as { entityTypeIds?: unknown }).entityTypeIds
            : undefined;
        return Array.isArray(typeIds)
          ? typeIds.filter(
              (typeId): typeId is VersionedUrl =>
                typeof typeId === "string" &&
                validateVersionedUrl(typeId).type === "Ok",
            )
          : [];
      }),
    ),
  ];

  if (entityTypeIds.length === 0) {
    return undefined;
  }

  const { subgraph } = await queryEntityTypeSubgraph(
    graphApiClient,
    authentication,
    {
      filter: {
        any: entityTypeIds.map((entityTypeId) => ({
          equal: [{ path: ["versionedUrl"] }, { parameter: entityTypeId }],
        })),
      },
      graphResolveDepths: { inheritsFrom: 255 },
      traversalPaths: [],
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

  const ancestors = new Map<VersionedUrl, VersionedUrl[]>();
  for (const entityTypeId of entityTypeIds) {
    const ancestorIds = getAncestorIds(subgraph, entityTypeId);
    if (ancestorIds) {
      ancestors.set(entityTypeId, ancestorIds);
    }
  }
  return ancestors;
};

/**
 * Fetches the entities whose properties or types the given subjects read, as the user running the flow. Each
 * EntityId loads exactly the edition it names: the draft for one with a draftId, otherwise the live edition. An
 * entity they can't read is left out, so reading it fails rather than matching. Empty and malformed EntityIds aren't
 * queried: evaluation treats the former as empty and rejects the latter.
 *
 * With `includeSubtypes`, also fetches the ancestors of the entities' types, in one more query.
 *
 * The subjects must have been validated against `kind`.
 */
export const getConditionContext = async (params: {
  authentication: { actorId: UserId };
  subjects: readonly ConditionSubject[];
  includeSubtypes?: boolean;
  kind: PayloadKind;
  values: readonly unknown[];
}): Promise<ConditionContext> => {
  const { authentication, subjects, includeSubtypes, kind, values } = params;

  const entities =
    kind === "EntityId" &&
    subjects.some(
      (subject) =>
        subject.kind === "entityProperty" || subject.kind === "entityType",
    )
      ? await getEntities(authentication, values)
      : undefined;

  if (!includeSubtypes) {
    return entities ? { entities } : {};
  }

  const entityTypeAncestors = await getEntityTypeAncestors(
    authentication,
    kind === "EntityId" ? [...(entities?.values() ?? [])] : values,
  );

  return {
    ...(entities && { entities }),
    ...(entityTypeAncestors && { entityTypeAncestors }),
  };
};
