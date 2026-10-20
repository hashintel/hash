import { getHashWebId } from "@local/hash-backend-utils/flows/shared/get-hash-web-id";
import {
  flowDefinitionIds,
  generateHashFlowDefinitionEntityId,
} from "@local/hash-isomorphic-utils/flows/flow-definition-ids";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import type { Entity, UserId, WebId } from "@blockprotocol/type-system";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";

export const triggerPdfAnalysisWorkflow = async ({
  entity,
  graphApiClient,
  temporalClient,
  userAccountId,
  webId,
}: {
  entity: Entity<File>;
  graphApiClient: GraphApi;
  temporalClient: TemporalClient;
  userAccountId: UserId;
  webId: WebId;
}) => {
  const { entityId, properties } = entity;

  const mimeType =
    properties[
      "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/"
    ];

  if (mimeType !== "application/pdf") {
    return;
  }

  const flowDefinitionEntityId = generateHashFlowDefinitionEntityId(
    await getHashWebId(graphApiClient, { actorId: userAccountId }),
    flowDefinitionIds.inferMetadataFromDocument,
  );

  const params: RunFlowWorkflowParams = {
    dataSources: {
      files: { fileEntityIds: [] },
      internetAccess: {
        enabled: false,
        browserPlugin: {
          enabled: false,
          domains: [],
        },
      },
    },
    flowDefinitionEntityId,
    flowInputs: {
      fileEntityId: { kind: "EntityId", value: entityId },
    },
    userAuthentication: { actorId: userAccountId },
    webId,
  };

  const workflowId = generateUuid();

  await temporalClient.workflow.start<
    (params: RunFlowWorkflowParams) => Promise<RunFlowWorkflowResponse>
  >("runFlow", {
    taskQueue: "ai",
    args: [params],
    memo: {
      flowDefinitionEntityId,
      userAccountId,
      webId,
    },
    retry: {
      maximumAttempts: 1,
    },
    workflowId,
  });
};
