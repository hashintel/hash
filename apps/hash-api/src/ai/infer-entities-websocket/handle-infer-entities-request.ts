import type { DistributiveOmit } from "@local/advanced-types/distribute";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  AutomaticInferenceWebsocketRequestMessage,
  ManualInferenceWebsocketRequestMessage,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  automaticBrowserInferenceFlowDefinition,
  manualBrowserInferenceFlowDefinition,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type { FlowTrigger } from "@local/hash-isomorphic-utils/flows/types";
import type { Client } from "@temporalio/client";

import type { User } from "../../graph/knowledge/system-types/user";

export const handleInferEntitiesRequest = async ({
  temporalClient,
  message,
  user,
}: {
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

  await temporalClient.workflow.start<
    (params: RunFlowWorkflowParams) => Promise<RunFlowWorkflowResponse>
  >("inferEntities", {
    taskQueue: "ai",
    args: [
      {
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
