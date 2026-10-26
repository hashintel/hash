import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { typedKeys } from "@local/advanced-types/typed-entries";
import { queryEntities, summarizeEntities } from "@local/hash-graph-sdk/entity";
import { flowRunsQueryMaxLimit } from "@local/hash-isomorphic-utils/flows/types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  getFlowRunFromTemporalWorkflowId,
  getSparseFlowRunFromTemporalWorkflowId,
} from "./flows/get-flow-run-details.js";
import { getFlowRunEntityById } from "./flows/shared/get-flow-run-entity-by-id.js";
import { getFlowRunLinks } from "./flows/shared/get-flow-run-links.js";

import type { FileStorageProvider } from "./file-storage.js";
import type { FlowRunHistoriesByWorkflowId } from "./flows/run-events.js";
import type { TemporalClient } from "./temporal.js";
import type {
  ActorEntityUuid,
  EntityId,
  EntityUuid,
  WebId,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  FlowRunWithoutEvents,
  SparseFlowRun,
} from "@local/hash-isomorphic-utils/flows/types";
import type { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import type { FlowRun as FlowRunEntity } from "@local/hash-isomorphic-utils/system-types/shared";

export { getFlowRunEntityById };

export type {
  ActionName,
  CreateFlowActivities,
  FlowActionActivity,
} from "./flows/action-types.js";
export { createCommonFlowActivities } from "./flows/process-flow-workflow/common-activities.js";

type GetFlowRunByIdFnArgs<IncludeDetails extends boolean = boolean> = {
  flowRunEntityId: EntityId;
  includeDetails: IncludeDetails;
  graphApiClient: GraphApi;
  storageProvider: FileStorageProvider;
  temporalClient: TemporalClient;
  userAuthentication: { actorId: ActorEntityUuid };
  /** Histories already read in this request, to reuse when reading details */
  historiesByWorkflowId?: FlowRunHistoriesByWorkflowId;
};

export async function getFlowRunById(
  args: GetFlowRunByIdFnArgs<true>,
): Promise<FlowRunWithoutEvents | null>;

export async function getFlowRunById(
  args: GetFlowRunByIdFnArgs<false>,
): Promise<SparseFlowRun | null>;

export async function getFlowRunById<IncludeDetails extends boolean>(
  args: GetFlowRunByIdFnArgs<IncludeDetails>,
): Promise<
  (IncludeDetails extends true ? FlowRunWithoutEvents : SparseFlowRun) | null
>;

export async function getFlowRunById({
  flowRunEntityId,
  includeDetails,
  graphApiClient,
  storageProvider,
  temporalClient,
  userAuthentication,
  historiesByWorkflowId,
}: GetFlowRunByIdFnArgs<boolean>): Promise<
  SparseFlowRun | FlowRunWithoutEvents | null
> {
  const existingFlowEntity = await getFlowRunEntityById({
    flowRunEntityId,
    graphApiClient,
    userAuthentication,
  });

  if (!existingFlowEntity) {
    return null;
  }

  const webId = extractWebIdFromEntityId(
    existingFlowEntity.metadata.recordId.entityId,
  );

  const temporalWorkflowId =
    existingFlowEntity.properties[
      "https://hash.ai/@h/types/property-type/workflow-id/"
    ];

  const name =
    existingFlowEntity.properties[
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/"
    ];

  const links = (
    await getFlowRunLinks({
      flowRunEntityIds: [flowRunEntityId],
      graphApiClient,
      userAuthentication,
    })
  ).get(flowRunEntityId);

  if (!links?.flowDefinitionEntityId) {
    /* A run from before flow runs linked to their definition: it can't be shown. */
    return null;
  }

  const flowDefinitionEntityId = links.flowDefinitionEntityId;
  const flowScheduleId = links.flowTriggerId ?? undefined;

  if (includeDetails) {
    return getFlowRunFromTemporalWorkflowId({
      flowDefinitionEntityId,
      flowRunEntityId,
      flowScheduleId,
      historiesByWorkflowId,
      name,
      storageProvider,
      temporalClient,
      temporalWorkflowId,
      webId,
    });
  } else {
    return getSparseFlowRunFromTemporalWorkflowId({
      flowDefinitionEntityId,
      flowRunEntityId,
      flowScheduleId,
      name,
      temporalClient,
      temporalWorkflowId,
      webId,
    });
  }
}

const convertScreamingSnakeToPascalCase = (str: string) =>
  str
    .split("_")
    .map((word) =>
      word[0] ? word[0].toUpperCase() + word.slice(1).toLowerCase() : "",
    )
    .join("");

type GetFlowRunsFilters = {
  executionStatus?: FlowRunStatus | null;
  flowDefinitionEntityIds?: EntityId[] | null;
  cursor?: string | null;
  limit?: number | null;
};

type GetFlowRunsFnArgs<IncludeDetails extends boolean> = {
  authentication: { actorId: ActorEntityUuid };
  filters: GetFlowRunsFilters;
  includeDetails: IncludeDetails;
  graphApiClient: GraphApi;
  storageProvider: FileStorageProvider;
  temporalClient: TemporalClient;
  /** Histories already read in this request, to reuse when reading details */
  historiesByWorkflowId?: FlowRunHistoriesByWorkflowId;
};

type MinimalFlowMetadata = {
  flowDefinitionEntityId: EntityId;
  flowRunEntityId: EntityId;
  flowScheduleId?: EntityUuid;
  name: string;
  temporalWorkflowId: string;
  webId: WebId;
};

type PaginatedFlowRuns<T> = {
  flowRuns: T[];
  totalCount: number;
  nextCursor: string | null;
};

export async function getFlowRuns(
  args: GetFlowRunsFnArgs<true>,
): Promise<PaginatedFlowRuns<FlowRunWithoutEvents>>;

export async function getFlowRuns(
  args: GetFlowRunsFnArgs<false>,
): Promise<PaginatedFlowRuns<SparseFlowRun>>;

export async function getFlowRuns<IncludeDetails extends boolean>(
  args: GetFlowRunsFnArgs<IncludeDetails>,
): Promise<
  PaginatedFlowRuns<
    IncludeDetails extends true ? FlowRunWithoutEvents : SparseFlowRun
  >
>;

export async function getFlowRuns({
  authentication,
  filters,
  graphApiClient,
  includeDetails,
  storageProvider,
  temporalClient,
  historiesByWorkflowId,
}: GetFlowRunsFnArgs<boolean>): Promise<
  PaginatedFlowRuns<SparseFlowRun | FlowRunWithoutEvents>
> {
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

  const entityQuery = queryEntities<FlowRunEntity>(
    { graphApi: graphApiClient },
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
  );

  const summaryQuery = summarizeEntities(
    { graphApi: graphApiClient },
    authentication,
    {
      filter,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includeCount: true,
    },
  );

  const [queryResult, summaryResult] = await Promise.all([
    entityQuery,
    summaryQuery,
  ]);

  const temporalWorkflowIdToFlowDetails: Record<string, MinimalFlowMetadata> =
    {};

  const linksByFlowRunEntityId = await getFlowRunLinks({
    flowRunEntityIds: queryResult.entities.map(
      (entity) => entity.metadata.recordId.entityId,
    ),
    graphApiClient,
    userAuthentication: authentication,
  });

  for (const entity of queryResult.entities) {
    const flowRunEntityId = entity.metadata.recordId.entityId;
    const webId = extractWebIdFromEntityId(flowRunEntityId);

    const links = linksByFlowRunEntityId.get(flowRunEntityId);

    if (!links?.flowDefinitionEntityId) {
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

    const name =
      entity.properties[
        "https://blockprotocol.org/@blockprotocol/types/property-type/name/"
      ];

    const temporalWorkflowId =
      entity.properties["https://hash.ai/@h/types/property-type/workflow-id/"];

    temporalWorkflowIdToFlowDetails[temporalWorkflowId] = {
      flowDefinitionEntityId: links.flowDefinitionEntityId,
      flowRunEntityId,
      flowScheduleId: links.flowTriggerId ?? undefined,
      name,
      temporalWorkflowId,
      webId,
    };
  }

  const temporalWorkflowIds = typedKeys(temporalWorkflowIdToFlowDetails);

  const nextCursor = queryResult.cursor
    ? JSON.stringify(queryResult.cursor)
    : null;
  const totalCount = summaryResult.count ?? 0;

  if (!temporalWorkflowIds.length) {
    return { flowRuns: [], totalCount, nextCursor };
  }

  /** @see https://docs.temporal.io/develop/typescript/observability#search-attributes */
  let query = `WorkflowType = 'runFlow' AND WorkflowId IN (${temporalWorkflowIds
    .map((id) => `'${id}'`)
    .join(", ")})`;

  if (filters.executionStatus) {
    query += ` AND ExecutionStatus = "${convertScreamingSnakeToPascalCase(
      filters.executionStatus,
    )}"`;
  }

  const workflowIterable = temporalClient.workflow.list({ query });

  const workflowIdToLatestRunTime: Record<string, string> = {};

  const deduplicatedWorkflowIds: string[] = [];

  for await (const workflow of workflowIterable) {
    const temporalWorkflowId = workflow.workflowId;

    const startTime = workflow.startTime.toISOString();
    workflowIdToLatestRunTime[temporalWorkflowId] ??= startTime;

    if (startTime < workflowIdToLatestRunTime[temporalWorkflowId]) {
      /**
       * This is an earlier run of the same workflow – it is a flow run that has been reset and started from a specific point.
       *
       * It could also theoretically be:
       * 1. a workflow that has been 'continued as new', but we do not yet use that Temporal feature.
       * 2. a workflowId that has been re-used, but we do not do that in our business logic – we generate a new workflowId for each flow run.
       *      workflowIds are only re-used by Temporal automatically in the 'reset' or 'continue as new' cases.
       */
      continue;
    }

    if (!temporalWorkflowIdToFlowDetails[temporalWorkflowId]) {
      throw new Error(
        `Could not find details for workflowId ${workflow.workflowId}`,
      );
    }

    deduplicatedWorkflowIds.push(temporalWorkflowId);
  }

  if (includeDetails) {
    const workflows: FlowRunWithoutEvents[] = [];

    for (const temporalWorkflowId of deduplicatedWorkflowIds) {
      const flowDetails = temporalWorkflowIdToFlowDetails[temporalWorkflowId]!;

      const runInfo = await getFlowRunFromTemporalWorkflowId({
        flowDefinitionEntityId: flowDetails.flowDefinitionEntityId,
        flowRunEntityId: flowDetails.flowRunEntityId,
        flowScheduleId: flowDetails.flowScheduleId,
        historiesByWorkflowId,
        name: flowDetails.name,
        storageProvider,
        temporalClient,
        temporalWorkflowId: flowDetails.temporalWorkflowId,
        webId: flowDetails.webId,
      });
      workflows.push(runInfo);
    }

    return { flowRuns: workflows, totalCount, nextCursor };
  } else {
    const workflows: SparseFlowRun[] = [];

    for (const temporalWorkflowId of deduplicatedWorkflowIds) {
      const flowDetails = temporalWorkflowIdToFlowDetails[temporalWorkflowId]!;

      const runInfo = await getSparseFlowRunFromTemporalWorkflowId({
        flowDefinitionEntityId: flowDetails.flowDefinitionEntityId,
        flowRunEntityId: flowDetails.flowRunEntityId,
        flowScheduleId: flowDetails.flowScheduleId,
        name: flowDetails.name,
        temporalClient,
        temporalWorkflowId: flowDetails.temporalWorkflowId,
        webId: flowDetails.webId,
      });
      workflows.push(runInfo);
    }

    return { flowRuns: workflows, totalCount, nextCursor };
  }
}
