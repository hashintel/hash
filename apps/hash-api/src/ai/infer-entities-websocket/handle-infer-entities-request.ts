import { getFlowRuns } from "@local/hash-backend-utils/flows";
import { getHashWebId } from "@local/hash-backend-utils/flows/shared/get-hash-web-id";
import {
  flowDefinitionIds,
  generateHashFlowDefinitionEntityId,
} from "@local/hash-isomorphic-utils/flows/flow-definition-ids";

import { FlowRunStatus } from "../../graphql/api-types.gen";

import type { User } from "../../graph/knowledge/system-types/user";
import type { EntityUuid } from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  AutomaticInferenceWebsocketRequestMessage,
  ManualInferenceWebsocketRequestMessage,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type { AutomaticInferenceInputs } from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type { Client } from "@temporalio/client";

export const handleInferEntitiesRequest = async ({
  graphApiClient,
  temporalClient,
  message,
  user,
}: {
  graphApiClient: GraphApi;
  temporalClient: Client;
  message: DistributiveOmit<
    | ManualInferenceWebsocketRequestMessage
    | AutomaticInferenceWebsocketRequestMessage,
    "cookie"
  >;
  user: User;
}) => {
  const {
    requestUuid,
    payload: { webId, ...flowInputs },
  } = message;

  const hashWebId = await getHashWebId(graphApiClient, {
    actorId: user.accountId,
  });

  const flowDefinitionEntityId = generateHashFlowDefinitionEntityId(
    hashWebId,
    message.type === "manual-inference-request"
      ? flowDefinitionIds.manualBrowserInference
      : flowDefinitionIds.automaticBrowserInference,
  );

  if (message.type === "automatic-inference-request") {
    const openFlowRuns = await getFlowRuns({
      authentication: { actorId: user.accountId },
      filters: {
        executionStatus: FlowRunStatus.Running,
        flowDefinitionEntityIds: [
          flowDefinitionIds.automaticBrowserInference,
          flowDefinitionIds.manualBrowserInference,
        ].map((flowDefinitionId) =>
          generateHashFlowDefinitionEntityId(hashWebId, flowDefinitionId),
        ),
      },
      graphApiClient,
    });

    for (const flowRun of openFlowRuns.flowRuns) {
      const runInputs = flowRun.flowInputs as Partial<AutomaticInferenceInputs>;

      const flowIsAlreadyRunningOnPage =
        runInputs.visitedWebPage?.value.url ===
        flowInputs.visitedWebPage.value.url;

      if (flowIsAlreadyRunningOnPage) {
        return true;
      }
    }
  }

  await temporalClient.workflow.start<
    (params: RunFlowWorkflowParams) => Promise<RunFlowWorkflowResponse>
  >("runFlow", {
    taskQueue: "ai",
    args: [
      {
        dataSources: {
          files: { fileEntityIds: [] },
          internetAccess: {
            enabled: true,
            browserPlugin: {
              enabled: true,
              domains: ["linkedin.com"],
            },
          },
        },
        flowDefinitionEntityId,
        flowInputs,
        /* So that the run's entity id can be worked out from the request, as the browser plugin does. */
        flowRunEntityUuid: requestUuid as EntityUuid,
        userAuthentication: { actorId: user.accountId },
        webId,
      },
    ],
    memo: {
      flowDefinitionEntityId,
      userAccountId: user.accountId,
      webId,
    },
    workflowId: requestUuid,
    retry: {
      maximumAttempts: 1,
    },
  });
};
