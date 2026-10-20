import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";

import type { GraphApi } from "../../graph/context-types";
import type { User } from "../../graph/knowledge/system-types/user";
import type { CancelInferEntitiesWebsocketRequestMessage } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { Client } from "@temporalio/client";

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
  const { flowRunEntityId } = message;

  const flow = await getFlowRunEntityById({
    userAuthentication: { actorId: user.accountId },
    flowRunEntityId,
    graphApiClient,
  });

  if (!flow) {
    return;
  }

  const workflowHandle = temporalClient.workflow.getHandle(
    flow.properties["https://hash.ai/@h/types/property-type/workflow-id/"],
  );

  void workflowHandle.cancel();
};
