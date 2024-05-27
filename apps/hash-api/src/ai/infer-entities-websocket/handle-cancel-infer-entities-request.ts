import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import type { CancelInferEntitiesWebsocketRequestMessage } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { Client } from "@temporalio/client";

import type { GraphApi } from "../../graph/context-types";
import type { User } from "../../graph/knowledge/system-types/user";

export const handleCancelInferEntitiesRequest = async ({
  graphApiClient,
  temporalClient,
  message,
  user,
}: {
  graphApiClient: GraphApi;
  temporalClient: Client;
  message: Omit<CancelInferEntitiesWebsocketRequestMessage, "cookie">;
  user: User;
}) => {
  const { flowRunId } = message;

  const flow = await getFlowRunEntityById({
    userAuthentication: { actorId: user.accountId },
    flowRunId: flowRunId as EntityUuid,
    graphApiClient,
  });

  if (!flow) {
    return;
  }

  const workflowHandle = temporalClient.workflow.getHandle(flowRunId);

  void workflowHandle.cancel();
};
