import type { DistributiveOmit } from "@local/advanced-types/distribute";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import { getFlowRuns } from "@local/hash-backend-utils/flows";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  AutomaticInferenceWebsocketRequestMessage,
  ManualInferenceWebsocketRequestMessage,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  automaticBrowserInferenceFlowDefinition,
  manualBrowserInferenceFlowDefinition,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import type {
  AutomaticInferenceTriggerInputName,
  AutomaticInferenceTriggerInputs,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  FlowTrigger,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Client } from "@temporalio/client";

import type { User } from "../../graph/knowledge/system-types/user";
import { FlowRunStatus } from "../../graphql/api-types.gen";

export const handleInferEntitiesRequest = async ({
  graphApiClient,
  storageProvider,
  temporalClient,
  message,
  user,
}: {
  graphApiClient: GraphApi;
  storageProvider: FileStorageProvider;
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
    payload: { webId, ...triggerOutputs },
  } = message;

  const flowDefinition =
    message.type === "manual-inference-request"
      ? manualBrowserInferenceFlowDefinition
      : automaticBrowserInferenceFlowDefinition;

  const flowTrigger: FlowTrigger = {
    triggerDefinitionId: flowDefinition.trigger.triggerDefinitionId,
    outputs: typedEntries(triggerOutputs).map(([outputName, payload]) => ({
      outputName,
      payload,
    })),
  };

  if (message.type === "automatic-inference-request") {
    const openFlowRuns = await getFlowRuns({
      authentication: { actorId: user.accountId },
      filters: {
        executionStatus: FlowRunStatus.Running,
        flowDefinitionIds: [
          automaticBrowserInferenceFlowDefinition.flowDefinitionId,
          manualBrowserInferenceFlowDefinition.flowDefinitionId,
        ],
      },
      graphApiClient,
      includeDetails: true,
      storageProvider,
      temporalClient,
    });

    for (const flowRun of openFlowRuns.flowRuns) {
      const flowIsAlreadyRunningOnPage = (
        flowRun.inputs[0].flowTrigger.outputs as StepOutput<
          AutomaticInferenceTriggerInputs[AutomaticInferenceTriggerInputName]
        >[]
      ).some(
        (triggerOutput) =>
          triggerOutput.outputName ===
            ("visitedWebPage" satisfies AutomaticInferenceTriggerInputName) &&
          triggerOutput.payload.value.url ===
            triggerOutputs.visitedWebPage.value.url,
      );

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
        flowDefinition,
        flowTrigger,
        userAuthentication: { actorId: user.accountId },
        webId,
      },
    ],
    memo: {
      flowDefinitionId: flowDefinition.flowDefinitionId,
      userAccountId: user.accountId,
      webId,
    },
    workflowId: requestUuid,
    retry: {
      maximumAttempts: 1,
    },
  });
};
