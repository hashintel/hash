import {
  CancelInferEntitiesRequestMessage,
  InferEntitiesResponseMessage,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { StatusCode } from "@local/status";
import type { Client } from "@temporalio/client";
import type { WebSocket } from "ws";

import { User } from "../../graph/knowledge/system-types/user";

export const handleCancelInferEntitiesRequest = async ({
  socket,
  temporalClient,
  message,
  user,
}: {
  socket: WebSocket;
  temporalClient: Client;
  message: Omit<CancelInferEntitiesRequestMessage, "cookie">;
  user: User;
}) => {
  const { requestUuid } = message;

  const workflowHandle = temporalClient.workflow.getHandle(requestUuid);

  const description = await workflowHandle.describe();

  if (description.memo?.userAccountId !== user.accountId) {
    const responseMessage: InferEntitiesResponseMessage = {
      payload: {
        code: StatusCode.InvalidArgument,
        contents: [],
        message: `User has no request with id ${requestUuid}`,
      },
      requestUuid,
      status: "bad-request",
      type: "inference-response",
    };
    socket.send(JSON.stringify(responseMessage));
    return;
  }

  void workflowHandle.cancel();
};
