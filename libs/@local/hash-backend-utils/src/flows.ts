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

import { getFlowRunRecord } from "./flows/run-record.js";
import { getFlowRunEntityById } from "./flows/shared/get-flow-run-entity-by-id.js";
import { getFlowRunLinks } from "./flows/shared/get-flow-run-links.js";
import {
  correctFlowRunStatusFromRecord,
  getFlowRunStatusFieldsFromEntity,
  getFlowRunStatusFieldsFromRecordHeader,
} from "./flows/shared/save-flow-run-status.js";

import type { FileStorageProvider } from "./file-storage.js";
import type { FlowRunRecordsByWorkflowId } from "./flows/run-record.js";
import type { FlowRunLinks } from "./flows/shared/get-flow-run-links.js";
import type { TemporalClient } from "./temporal.js";
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

type FlowRunReaders = {
  graphApiClient: GraphApi;
  storageProvider: FileStorageProvider;
  temporalClient: TemporalClient;
  userAuthentication: { actorId: ActorEntityUuid };
  /** Records already read in this request, to reuse */
  recordsByWorkflowId?: FlowRunRecordsByWorkflowId;
};

/**
 * A run as its entity describes it. An entity that doesn't hold the run's status yet, because the run started before
 * runs saved it, is given it from the run's record.
 */
const getFlowRunSummary = async ({
  entity,
  links,
  ...readers
}: FlowRunReaders & {
  entity: HashEntity<FlowRunEntity>;
  links: FlowRunLinks & { flowDefinitionEntityId: EntityId };
}): Promise<FlowRunSummary> => {
  const { properties } = entity;
  const flowRunEntityId = entity.metadata.recordId.entityId;

  let statusFields = getFlowRunStatusFieldsFromEntity(entity);

  if (!statusFields) {
    const { header } = await getFlowRunRecord({
      recordsByWorkflowId: readers.recordsByWorkflowId,
      storageProvider: readers.storageProvider,
      temporalClient: readers.temporalClient,
      workflowId:
        properties["https://hash.ai/@h/types/property-type/workflow-id/"],
    });

    await correctFlowRunStatusFromRecord({
      flowRunEntity: entity,
      graphApiClient: readers.graphApiClient,
      header,
      userAuthentication: readers.userAuthentication,
    });

    statusFields = getFlowRunStatusFieldsFromRecordHeader(header);
  }

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
    /* An entity from before Flow Run v3 can't hold open requests. */
    openInputRequests: (properties[
      "https://hash.ai/@h/types/property-type/open-input-request/"
    ] ?? []) as ExternalInputRequest[],
  };
};

const hasFlowDefinition = (
  links: FlowRunLinks | undefined,
): links is FlowRunLinks & { flowDefinitionEntityId: EntityId } =>
  !!links?.flowDefinitionEntityId;

export const getFlowRunById = async ({
  flowRunEntityId,
  ...readers
}: FlowRunReaders & {
  flowRunEntityId: EntityId;
}): Promise<FlowRunSummary | null> => {
  const entity = await getFlowRunEntityById({
    flowRunEntityId,
    graphApiClient: readers.graphApiClient,
    userAuthentication: readers.userAuthentication,
  });

  if (!entity) {
    return null;
  }

  const links = (
    await getFlowRunLinks({
      flowRunEntityIds: [flowRunEntityId],
      graphApiClient: readers.graphApiClient,
      userAuthentication: readers.userAuthentication,
    })
  ).get(flowRunEntityId);

  if (!hasFlowDefinition(links)) {
    /* A run from before flow runs linked to their definition: it can't be shown. */
    return null;
  }

  return getFlowRunSummary({ entity, links, ...readers });
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
  ...readers
}: Omit<FlowRunReaders, "userAuthentication"> & {
  authentication: { actorId: ActorEntityUuid };
  filters: GetFlowRunsFilters;
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
    queryEntities<FlowRunEntity>(
      { graphApi: readers.graphApiClient },
      authentication,
      {
        filter,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
        limit: effectiveLimit,
        ...(filters.cursor
          ? { cursor: JSON.parse(filters.cursor) as object[] }
          : {}),
      },
    ),
    summarizeEntities({ graphApi: readers.graphApiClient }, authentication, {
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
    graphApiClient: readers.graphApiClient,
    userAuthentication: authentication,
  });

  const flowRuns: FlowRunSummary[] = [];

  /* One at a time, as a run whose entity doesn't hold its status yet has its record read. */
  for (const entity of queryResult.entities) {
    const links = linksByFlowRunEntityId.get(entity.metadata.recordId.entityId);

    if (!hasFlowDefinition(links)) {
      /* A run from before flow runs linked to their definition: it can't be shown. */
      continue;
    }

    /*
     * The query's filter matches a `Uses` link in any web, so a run is only kept if the link in its own web is to
     * one of the requested definitions. A page can then hold fewer runs than its limit.
     */
    if (
      filters.flowDefinitionEntityIds &&
      !filters.flowDefinitionEntityIds.includes(links.flowDefinitionEntityId)
    ) {
      continue;
    }

    flowRuns.push(
      await getFlowRunSummary({
        entity,
        links,
        ...readers,
        userAuthentication: authentication,
      }),
    );
  }

  return {
    flowRuns: flowRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    totalCount: summaryResult.count ?? 0,
    nextCursor: queryResult.cursor ? JSON.stringify(queryResult.cursor) : null,
  };
};
