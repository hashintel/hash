import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { queryEntities, summarizeEntities } from "@local/hash-graph-sdk/entity";
import { mapInputsPropertyToFlowInputValues } from "@local/hash-isomorphic-utils/flows/mappings";
import { flowRunsQueryMaxLimit } from "@local/hash-isomorphic-utils/flows/types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getFlowRunEntityById } from "./flows/shared/get-flow-run-entity-by-id.js";
import { getFlowRunLinks } from "./flows/shared/get-flow-run-links.js";
import { getFlowRunStatusFieldsFromEntity } from "./flows/shared/save-flow-run-status.js";

import type { FlowRunLinks } from "./flows/shared/get-flow-run-links.js";
import type { ActorEntityUuid, EntityId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ExternalInputRequest } from "@local/hash-isomorphic-utils/flows/types";
import type {
  FlowRunStatus,
  FlowRunSummary,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import type { FlowRun as FlowRunEntity } from "@local/hash-isomorphic-utils/system-types/shared";

export { getFlowRunEntityById };

export type {
  ActionName,
  CreateFlowActivities,
  FlowActionActivity,
} from "./flows/action-types.js";
export { createCommonFlowActivities } from "./flows/process-flow-workflow/common-activities.js";

/** A run's links, which every run has to the flow definition it runs. */
const getFlowDefinitionLinks = (
  flowRunEntityId: EntityId,
  links: FlowRunLinks | undefined,
): FlowRunLinks & { flowDefinitionEntityId: EntityId } => {
  if (!links?.flowDefinitionEntityId) {
    throw new Error(`Flow run ${flowRunEntityId} has no flow definition`);
  }

  return { ...links, flowDefinitionEntityId: links.flowDefinitionEntityId };
};

/** A run as its entity describes it. */
const getFlowRunSummary = ({
  entity,
  links,
}: {
  entity: HashEntity<FlowRunEntity>;
  links: FlowRunLinks & { flowDefinitionEntityId: EntityId };
}): FlowRunSummary => {
  const { properties } = entity;
  const flowRunEntityId = entity.metadata.recordId.entityId;

  const statusFields = getFlowRunStatusFieldsFromEntity(entity);

  return {
    flowDefinitionEntityId: links.flowDefinitionEntityId,
    flowRunEntityId,
    flowScheduleId: links.flowTriggerId,
    name: properties[
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/"
    ],
    webId: extractWebIdFromEntityId(flowRunEntityId),
    status: statusFields.status,
    startedAt: statusFields.startedAt,
    closedAt: statusFields.closedAt ?? null,
    flowInputs: mapInputsPropertyToFlowInputValues(
      properties["https://hash.ai/@h/types/property-type/inputs/"],
    ),
    openInputRequests: (properties[
      "https://hash.ai/@h/types/property-type/open-input-request/"
    ] ?? []) as ExternalInputRequest[],
  };
};

export const getFlowRunById = async ({
  flowRunEntityId,
  graphApiClient,
  userAuthentication,
}: {
  flowRunEntityId: EntityId;
  graphApiClient: GraphApi;
  userAuthentication: { actorId: ActorEntityUuid };
}): Promise<FlowRunSummary | null> => {
  const entity = await getFlowRunEntityById({
    flowRunEntityId,
    graphApiClient,
    userAuthentication,
  });

  if (!entity) {
    return null;
  }

  const links = await getFlowRunLinks({
    flowRunEntityIds: [flowRunEntityId],
    graphApiClient,
    userAuthentication,
  });

  return getFlowRunSummary({
    entity,
    links: getFlowDefinitionLinks(flowRunEntityId, links.get(flowRunEntityId)),
  });
};

type GetFlowRunsFilters = {
  executionStatus?: FlowRunStatus | null;
  flowDefinitionEntityIds?: EntityId[] | null;
  cursor?: string | null;
  limit?: number | null;
};

type PaginatedFlowRuns = {
  flowRuns: FlowRunSummary[];
  totalCount: number;
  nextCursor: string | null;
};

/** A page of runs, latest first within the page. */
export const getFlowRuns = async ({
  authentication,
  filters,
  graphApiClient,
}: {
  authentication: { actorId: ActorEntityUuid };
  filters: GetFlowRunsFilters;
  graphApiClient: GraphApi;
}): Promise<PaginatedFlowRuns> => {
  const effectiveLimit = Math.min(
    Math.max(filters.limit ?? flowRunsQueryMaxLimit, 0),
    flowRunsQueryMaxLimit,
  );

  const filter = {
    all: [
      {
        equal: [
          {
            path: ["type", "baseUrl"],
          },
          {
            parameter: systemEntityTypes.flowRun.entityTypeBaseUrl,
          },
        ],
      },
      ...(filters.executionStatus
        ? [
            {
              equal: [
                {
                  path: [
                    "properties",
                    systemPropertyTypes.status.propertyTypeBaseUrl,
                  ],
                },
                { parameter: filters.executionStatus },
              ],
            },
          ]
        : []),
      ...(filters.flowDefinitionEntityIds
        ? [
            {
              /**
               * A run `Uses` the flow definition it runs. Matched by the definition's uuid here, and by its full
               * entity id when the run's links are read below.
               */
              any: filters.flowDefinitionEntityIds.map(
                (flowDefinitionEntityId) => ({
                  equal: [
                    { path: ["outgoingLinks", "rightEntity", "uuid"] },
                    {
                      parameter: extractEntityUuidFromEntityId(
                        flowDefinitionEntityId,
                      ),
                    },
                  ],
                }),
              ),
            },
          ]
        : []),
    ],
  };

  const [queryResult, summaryResult] = await Promise.all([
    queryEntities<FlowRunEntity>({ graphApi: graphApiClient }, authentication, {
      filter,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
      limit: effectiveLimit,
      ...(filters.cursor
        ? { cursor: JSON.parse(filters.cursor) as object[] }
        : {}),
    }),
    summarizeEntities({ graphApi: graphApiClient }, authentication, {
      filter,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includeCount: true,
    }),
  ]);

  const linksByFlowRunEntityId = await getFlowRunLinks({
    flowRunEntityIds: queryResult.entities.map(
      (entity) => entity.metadata.recordId.entityId,
    ),
    graphApiClient,
    userAuthentication: authentication,
  });

  const flowRuns = queryResult.entities
    .map((entity) => {
      const flowRunEntityId = entity.metadata.recordId.entityId;

      return getFlowRunSummary({
        entity,
        links: getFlowDefinitionLinks(
          flowRunEntityId,
          linksByFlowRunEntityId.get(flowRunEntityId),
        ),
      });
    })
    /*
     * The query's filter matches a `Uses` link in any web, so a run is only kept if the link in its own web is to
     * one of the requested definitions. A page can then hold fewer runs than its limit.
     */
    .filter(
      ({ flowDefinitionEntityId }) =>
        !filters.flowDefinitionEntityIds ||
        filters.flowDefinitionEntityIds.includes(flowDefinitionEntityId),
    );

  return {
    flowRuns: flowRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    totalCount: summaryResult.count ?? 0,
    nextCursor: queryResult.cursor ? JSON.stringify(queryResult.cursor) : null,
  };
};
