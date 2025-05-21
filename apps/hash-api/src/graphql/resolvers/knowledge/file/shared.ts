import type { Entity, UserId, WebId } from "@blockprotocol/type-system";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import { inferMetadataFromDocumentFlowDefinition } from "@local/hash-isomorphic-utils/flows/file-flow-definitions";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";

export const triggerPdfAnalysisWorkflow = async ({
  entity,
  temporalClient,
  userAccountId,
  webId,
}: {
  entity: Entity<File>;
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
    flowDefinition: inferMetadataFromDocumentFlowDefinition,
    flowTrigger: {
      triggerDefinitionId: "onFileUpload",
      outputs: [
        {
          outputName: "fileEntityId",
          payload: {
            kind: "EntityId",
            value: entityId,
          },
        },
      ],
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
      flowDefinitionId:
        inferMetadataFromDocumentFlowDefinition.flowDefinitionId,
      userAccountId,
      webId,
    },
    retry: {
      maximumAttempts: 1,
    },
    workflowId,
  });
};
