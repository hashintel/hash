import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { GraphApi } from "@local/hash-graph-client";
import type { GraphEntity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId, EntityUuid } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { SparseFlowRun } from "@local/hash-isomorphic-utils/flows/types";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import type {
  FlowRun,
  FlowRunStatus,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { FlowRunProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  splitEntityId,
} from "@local/hash-subgraph";

import {
  getFlowRunFromWorkflowId,
  getSparseFlowRunFromWorkflowId,
} from "../flows/get-flow-run-details";

export const getFlowRunEntityById = async (params: {
  flowRunId: EntityUuid;
  graphApiClient: GraphApi;
  userAuthentication: { actorId: AccountId };
}): Promise<GraphEntity<FlowRunProperties> | null> => {
  const { flowRunId, graphApiClient, userAuthentication } = params;

  const [existingFlowEntity] = await graphApiClient
    .getEntities(userAuthentication.actorId, {
      filter: {
        all: [
          {
            equal: [{ path: ["uuid"] }, { parameter: flowRunId }],
          },
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.flowRun.entityTypeId,
            { ignoreParents: true },
          ),
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    })
    .then(({ data: response }) =>
      response.entities.map(
        (entity) =>
          mapGraphApiEntityToEntity(
            entity,
            userAuthentication.actorId,
          ) as GraphEntity<FlowRunProperties>,
      ),
    );

  return existingFlowEntity ?? null;
};

type GetFlowRunByIdFnArgs<IncludeDetails extends boolean = boolean> = {
  flowRunId: EntityUuid;
  includeDetails: IncludeDetails;
  graphApiClient: GraphApi;
  temporalClient: TemporalClient;
  userAuthentication: { actorId: AccountId };
};

export async function getFlowRunById(
  args: GetFlowRunByIdFnArgs<true>,
): Promise<FlowRun | null>;

export async function getFlowRunById(
  args: GetFlowRunByIdFnArgs<false>,
): Promise<SparseFlowRun | null>;

export async function getFlowRunById<IncludeDetails extends boolean>(
  args: GetFlowRunByIdFnArgs<IncludeDetails>,
): Promise<(IncludeDetails extends true ? FlowRun : SparseFlowRun) | null>;

export async function getFlowRunById({
  flowRunId,
  includeDetails,
  graphApiClient,
  temporalClient,
  userAuthentication,
}: GetFlowRunByIdFnArgs<boolean>): Promise<SparseFlowRun | FlowRun | null> {
  const existingFlowEntity = await getFlowRunEntityById({
    flowRunId,
    graphApiClient,
    userAuthentication,
  });

  if (!existingFlowEntity) {
    return null;
  }

  const webId = extractOwnedByIdFromEntityId(
    existingFlowEntity.metadata.recordId.entityId,
  );

  if (includeDetails) {
    return getFlowRunFromWorkflowId({
      name: existingFlowEntity.properties[
        "https://blockprotocol.org/@blockprotocol/types/property-type/name/"
      ],
      workflowId: extractEntityUuidFromEntityId(
        existingFlowEntity.metadata.recordId.entityId,
      ),
      temporalClient,
      webId,
    });
  } else {
    return getSparseFlowRunFromWorkflowId({
      name: existingFlowEntity.properties[
        "https://blockprotocol.org/@blockprotocol/types/property-type/name/"
      ],
      workflowId: extractEntityUuidFromEntityId(
        existingFlowEntity.metadata.recordId.entityId,
      ),
      temporalClient,
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
  flowDefinitionIds?: string[] | null;
};

type GetFlowRunsFnArgs<IncludeDetails extends boolean> = {
  authentication: { actorId: AccountId };
  filters: GetFlowRunsFilters;
  includeDetails: IncludeDetails;
  graphApiClient: GraphApi;
  temporalClient: TemporalClient;
};

export async function getFlowRuns(
  args: GetFlowRunsFnArgs<true>,
): Promise<FlowRun[]>;

export async function getFlowRuns(
  args: GetFlowRunsFnArgs<false>,
): Promise<SparseFlowRun[]>;

export async function getFlowRuns<IncludeDetails extends boolean>(
  args: GetFlowRunsFnArgs<IncludeDetails>,
): Promise<IncludeDetails extends true ? FlowRun[] : SparseFlowRun[]>;

export async function getFlowRuns({
  authentication,
  filters,
  graphApiClient,
  includeDetails,
  temporalClient,
}: GetFlowRunsFnArgs<boolean>): Promise<SparseFlowRun[] | FlowRun[]> {
  const relevantFlows = await graphApiClient
    .getEntities(authentication.actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.flowRun.entityTypeId,
            { ignoreParents: true },
          ),
          ...(filters.flowDefinitionIds
            ? [
                {
                  any: filters.flowDefinitionIds.map((flowDefinitionId) => ({
                    equal: [
                      {
                        path: [
                          "properties",
                          systemPropertyTypes.flowDefinitionId
                            .propertyTypeBaseUrl,
                        ],
                      },
                      { parameter: flowDefinitionId },
                    ],
                  })),
                },
              ]
            : []),
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    })
    .then(({ data: response }) => {
      const flowRunIdToOwnedByAndName: Record<
        EntityUuid,
        { ownedById: OwnedById; name: string }
      > = {};
      for (const entity of response.entities) {
        const [ownedById, entityUuid] = splitEntityId(
          entity.metadata.recordId.entityId as EntityId,
        );

        flowRunIdToOwnedByAndName[entityUuid] = {
          name: (entity.properties as FlowRunProperties)[
            "https://blockprotocol.org/@blockprotocol/types/property-type/name/"
          ],
          ownedById,
        };
      }
      return flowRunIdToOwnedByAndName;
    });

  const relevantFlowRunIds = Object.keys(relevantFlows);

  if (!relevantFlowRunIds.length) {
    return [];
  }

  /** @see https://docs.temporal.io/dev-guide/typescript/observability#search-attributes */
  let query = `WorkflowType = 'runFlow' AND WorkflowId IN (${relevantFlowRunIds
    .map((uuid) => `'${uuid}'`)
    .join(", ")})`;

  if (filters.executionStatus) {
    query += ` AND ExecutionStatus = "${convertScreamingSnakeToPascalCase(
      filters.executionStatus,
    )}"`;
  }

  const workflowIterable = temporalClient.workflow.list({ query });

  if (includeDetails) {
    const workflows: FlowRun[] = [];

    for await (const workflow of workflowIterable) {
      const flowDetails = relevantFlows[workflow.workflowId as EntityUuid];

      if (!flowDetails) {
        throw new Error(
          `Could not find details for workflowId ${workflow.workflowId}`,
        );
      }

      const workflowId = workflow.workflowId;
      const runInfo = await getFlowRunFromWorkflowId({
        name: flowDetails.name,
        workflowId,
        temporalClient,
        webId: flowDetails.ownedById,
      });
      workflows.push(runInfo);
    }

    return workflows;
  } else {
    const workflows: SparseFlowRun[] = [];

    for await (const workflow of workflowIterable) {
      const workflowId = workflow.workflowId;

      const flowDetails = relevantFlows[workflow.workflowId as EntityUuid];

      if (!flowDetails) {
        throw new Error(
          `Could not find details for workflowId ${workflow.workflowId}`,
        );
      }
      const runInfo = await getSparseFlowRunFromWorkflowId({
        name: flowDetails.name,
        workflowId,
        temporalClient,
        webId: flowDetails.ownedById,
      });
      workflows.push(runInfo);
    }

    return workflows;
  }
}
