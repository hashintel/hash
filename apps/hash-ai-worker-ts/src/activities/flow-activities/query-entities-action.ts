import { currentTimestamp } from "@blockprotocol/type-system";
import {
  getStorageProvider,
  prepareOutputPayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { maxEntitiesPerStep } from "@local/hash-isomorphic-utils/flows/limits";
import { generateTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { scopeFilterToWeb } from "../shared/scope-filter-to-web.js";

import type { EntityId } from "@blockprotocol/type-system";
import type { FlowActionActivity } from "@local/hash-backend-utils/flows";
import type {
  EntityQueryCursor,
  EntityQuerySortingRecord,
} from "@local/hash-graph-client";

const lastEditedFirst: EntityQuerySortingRecord = {
  path: ["editionCreatedAtTransactionTime"],
  ordering: "descending",
  nulls: "last",
};

const byUuid: EntityQuerySortingRecord = {
  path: ["uuid"],
  ordering: "ascending",
  nulls: "last",
};

/**
 * Gets the entities in the flow's web that match the query and that the user running the flow can read, as the graph
 * sorts them. Archived entities are always left out.
 *
 * Every page is read as of the same instant, and ties are broken by UUID, so that the pages don't shift while they're
 * read. Reading stops at the limit; without one, every match is read, and more than `maxEntitiesPerStep` fails the step
 * rather than leave some out.
 */
export const queryEntitiesAction: FlowActionActivity<"queryEntities"> = async ({
  inputs,
}) => {
  const {
    query: { filter, includeDrafts, limit, sortingPaths, temporalAxes },
  } = getSimplifiedFlowActionInputs({ inputs, actionType: "queryEntities" });

  if (
    limit != null &&
    !(Number.isInteger(limit) && limit >= 1 && limit <= maxEntitiesPerStep)
  ) {
    return {
      code: StatusCode.InvalidArgument,
      message: `The limit must be a whole number from 1 to ${maxEntitiesPerStep.toLocaleString("en")}.`,
      contents: [],
    };
  }

  const { runId, stepId, userAuthentication, webId, workflowId } =
    await getFlowContext();

  /* The web is required outside the user's filter, so that no `any` in it can reach another web. */
  const graphFilter = scopeFilterToWeb(
    {
      all: [{ equal: [{ path: ["archived"] }, { parameter: false }] }, filter],
    },
    webId,
  );

  const sorting = sortingPaths?.length ? sortingPaths : [lastEditedFirst];
  const stableSorting = sorting.some(({ path }) => path[0] === "uuid")
    ? sorting
    : [...sorting, byUuid];

  const axes =
    temporalAxes ?? generateTimeInstantTemporalAxes(currentTimestamp());

  /* Without a limit, one more than the most a step returns shows that there are too many. */
  const enough = limit ?? maxEntitiesPerStep + 1;

  const entityIds: EntityId[] = [];
  let cursor: EntityQueryCursor | null | undefined;

  do {
    const response = await queryEntities(
      { graphApi: graphApiClient },
      userAuthentication,
      {
        filter: graphFilter,
        sortingPaths: stableSorting,
        temporalAxes: axes,
        includeDrafts: includeDrafts ?? false,
        includePermissions: false,
        cursor,
      },
    );

    for (const entity of response.entities) {
      entityIds.push(entity.metadata.recordId.entityId);
    }
    cursor = response.cursor;
  } while (cursor && entityIds.length < enough);

  if (limit == null && entityIds.length > maxEntitiesPerStep) {
    return {
      code: StatusCode.ResourceExhausted,
      message: `More than ${maxEntitiesPerStep.toLocaleString("en")} entities match the query. Narrow its filter, or set a limit.`,
      contents: [],
    };
  }

  const matches = entityIds.slice(0, enough);

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
