import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import type { CancelInferEntitiesWebsocketRequestMessage } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { EntityUuid } from "@local/hash-subgraph";
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
  const { requestUuid } = message;

  const flow = await getFlowRunEntityById({
    userAuthentication: { actorId: user.accountId },
    flowRunId: requestUuid as EntityUuid,
    graphApiClient,
  });

  if (!flow) {
    return;
  }

  const workflowHandle = temporalClient.workflow.getHandle(requestUuid);

  void workflowHandle.cancel();
};
