import {
  getStorageProvider,
  prepareOutputPayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  maxQueryEntities,
  validateQueryFilter,
  validateQueryLimit,
  validateQuerySort,
} from "@local/hash-isomorphic-utils/flows/query-entities";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { scopeFilterToWeb } from "../shared/scope-filter-to-web.js";
import { orderBy } from "./filter-action/order-by.js";
import { conditionToGraphFilter } from "./query-entities-action/condition-to-graph-filter.js";

import type { ConditionEntity } from "./filter-action/evaluate-condition.js";
import type { EntityId } from "@blockprotocol/type-system";
import type { FlowActionActivity } from "@local/hash-backend-utils/flows";
import type { EntityQueryCursor } from "@local/hash-graph-client";

/**
 * Gets the latest live version of the entities in the flow's web that match the filter and that the user running the
 * flow can read, sorted by the sort keys in turn. The graph can't sort by a property, so sorting reads every match,
 * and fails if there are more than `maxQueryEntities`. So does a query without a limit; with one and no sort, the step
 * stops reading once it has enough, in the graph's order (the most recently edited first).
 */
export const queryEntitiesAction: FlowActionActivity<"queryEntities"> = async ({
  inputs,
}) => {
  const {
    filter,
    sort = [],
    limit,
  } = getSimplifiedFlowActionInputs({ inputs, actionType: "queryEntities" });

  const error =
    validateQueryFilter(filter) ??
    validateQuerySort(sort) ??
    (limit === undefined ? undefined : validateQueryLimit(limit));

  if (error) {
    return { code: StatusCode.InvalidArgument, message: error, contents: [] };
  }

  const { runId, stepId, userAuthentication, webId, workflowId } =
    await getFlowContext();

  /* The web is required outside the user's filter, so that no `any` in it can reach another web. */
  const graphFilter = scopeFilterToWeb(
    {
      all: [
        { equal: [{ path: ["archived"] }, { parameter: false }] },
        conditionToGraphFilter(filter),
      ],
    },
    webId,
  );

  /*
   * Without a sort, the first entities up to the limit are enough. Otherwise every match is read, and one more than
   * the most a step returns shows that there are too many.
   */
  const enough =
    sort.length === 0 && limit !== undefined ? limit : maxQueryEntities + 1;

  let entityIds: EntityId[] = [];
  const entities = new Map<EntityId, ConditionEntity>();
  let cursor: EntityQueryCursor | null | undefined;

  do {
    const response = await queryEntities(
      { graphApi: graphApiClient },
      userAuthentication,
      {
        filter: graphFilter,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
        cursor,
      },
    );

    for (const entity of response.entities) {
      const { entityId } = entity.metadata.recordId;
      entityIds.push(entityId);
      if (sort.length > 0) {
        entities.set(entityId, {
          properties: entity.properties,
          entityTypeIds: entity.metadata.entityTypeIds,
        });
      }
    }
    cursor = response.cursor;
  } while (cursor && entityIds.length < enough);

  if (enough > maxQueryEntities && entityIds.length > maxQueryEntities) {
    return {
      code: StatusCode.ResourceExhausted,
      message: `More than ${maxQueryEntities.toLocaleString("en")} entities match the filter. Narrow it${sort.length > 0 ? "" : ", or set a limit"}.`,
      contents: [],
    };
  }

  /* Sorting by each key in turn, from the last, leaves entities in the order of the first, then the next, and so on. */
  for (const sortKey of [...sort].reverse()) {
    const sorted = orderBy({ kind: "EntityId", value: entityIds }, sortKey, {
      entities,
    });
    if (sorted.status === "error") {
      return {
        code: StatusCode.InvalidArgument,
        message: sorted.message,
        contents: [],
      };
    }
    entityIds = sorted.items.value;
  }

  const matches = entityIds.slice(0, limit);

  const payload = await prepareOutputPayload({
    storageProvider: getStorageProvider(),
    workflowId,
    runId,
    stepId,
    outputName: "entities",
    payload: { kind: "EntityId", value: matches },
  });

  return {
    code: StatusCode.Ok,
    message: `Found ${matches.length} entities`,
    contents: [{ outputs: [{ outputName: "entities", payload }] }],
  };
};
