import { isEntityId, splitEntityId } from "@blockprotocol/type-system";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import {
  conditionLeaves,
  validateCondition,
} from "@local/hash-isomorphic-utils/flows/filter-condition";
import { maxEntitiesPerStep } from "@local/hash-isomorphic-utils/flows/limits";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { graphApiClient } from "../../shared/graph-api-client.js";

import type {
  ConditionContext,
  ConditionEntity,
} from "./evaluate-condition.js";
import type { EntityId, UserId } from "@blockprotocol/type-system";
import type { EntityQueryCursor, Filter } from "@local/hash-graph-client";
import type {
  ConditionSubject,
  FilterCondition,
} from "@local/hash-isomorphic-utils/flows/filter-condition";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

/**
 * The subjects a condition reads from an item of `kind`: none for an invalid condition, whose evaluation reports the
 * error.
 */
export const getConditionSubjects = (
  condition: FilterCondition,
  kind: PayloadKind,
): ConditionSubject[] =>
  validateCondition(condition, kind)
    ? []
    : conditionLeaves(condition).map(({ subject }) => subject);

/**
 * Fetches the entities whose properties or types the given subjects read, as the user running the flow. Each
 * EntityId loads exactly the edition it names: the draft for one with a draftId, otherwise the live edition. An
 * entity they can't read is left out, so reading it fails rather than matching. Empty and malformed EntityIds aren't
 * queried: evaluation treats the former as empty and rejects the latter.
 *
 * The subjects must have been validated against `kind`.
 */
export const getConditionContext = async (params: {
  authentication: { actorId: UserId };
  subjects: readonly ConditionSubject[];
  kind: PayloadKind;
  values: readonly unknown[];
}): Promise<ConditionContext> => {
  const { authentication, subjects, kind, values } = params;

  if (
    kind !== "EntityId" ||
    !subjects.some(
      (subject) =>
        subject.kind === "entityProperty" || subject.kind === "entityType",
    )
  ) {
    return {};
  }

  const entityIds = [
    ...new Set(
      values.filter(
        (value): value is EntityId =>
          typeof value === "string" && isEntityId(value),
      ),
    ),
  ];

  if (entityIds.length === 0) {
    return {};
  }

  if (entityIds.length > maxEntitiesPerStep) {
    throw new Error(
      `A condition can read at most ${maxEntitiesPerStep} entities, but was given ${entityIds.length}.`,
    );
  }

  const filter: Filter = {
    any: entityIds.map((entityId) => {
      const [webId, entityUuid, draftId] = splitEntityId(entityId);

      return {
        all: [
          { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
          { equal: [{ path: ["webId"] }, { parameter: webId }] },
          draftId
            ? { equal: [{ path: ["draftId"] }, { parameter: draftId }] }
            : { not: { exists: { path: ["draftId"] } } },
        ],
      };
    }),
  };

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

  return { entities };
};
