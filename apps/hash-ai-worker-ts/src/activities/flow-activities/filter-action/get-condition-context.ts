import { isEntityId, splitEntityId } from "@blockprotocol/type-system";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import {
  conditionLeaves,
  validateCondition,
} from "@local/hash-isomorphic-utils/flows/filter-condition";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { graphApiClient } from "../../shared/graph-api-client.js";

import type { ConditionContext } from "./evaluate-condition.js";
import type { EntityId, UserId } from "@blockprotocol/type-system";
import type { FilterCondition } from "@local/hash-isomorphic-utils/flows/filter-condition";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

/**
 * Fetches the entities whose properties or types a condition reads, as the user running the flow. Each EntityId
 * loads exactly the edition it names: the draft for one with a draftId, otherwise the live edition. An entity they
 * can't read is left out, so a condition on it fails rather than matching. Empty and malformed EntityIds aren't
 * queried: evaluation treats the former as empty and rejects the latter.
 */
export const getConditionContext = async (params: {
  authentication: { actorId: UserId };
  condition: FilterCondition;
  kind: PayloadKind;
  values: readonly unknown[];
}): Promise<ConditionContext> => {
  const { authentication, condition, kind, values } = params;

  if (
    kind !== "EntityId" ||
    validateCondition(condition, kind) !== undefined ||
    !conditionLeaves(condition).some(
      ({ subject }) =>
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

  const { entities } = await queryEntities(
    { graphApi: graphApiClient },
    authentication,
    {
      filter: {
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
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: true,
      includePermissions: false,
    },
  );

  return {
    entities: new Map(
      entities.map((entity) => [
        entity.metadata.recordId.entityId,
        {
          properties: entity.properties,
          entityTypeIds: entity.metadata.entityTypeIds,
        },
      ]),
    ),
  };
};
