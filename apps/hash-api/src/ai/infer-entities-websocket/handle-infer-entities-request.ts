import {
  inferenceModelNames,
  InferEntitiesCallerParams,
  InferEntitiesRequestMessage,
  InferEntitiesResponseMessage,
  InferEntitiesReturn,
  inferEntitiesUserArgumentKeys,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { StatusCode } from "@local/status";
import type {
  ApplicationFailure,
  Client,
  WorkflowFailedError,
} from "@temporalio/client";
import type { WebSocket } from "ws";

import { User } from "../../graph/knowledge/system-types/user";

export const handleInferEntitiesRequest = async ({
  socket,
  temporalClient,
  message,
  user,
}: {
  socket: WebSocket;
  temporalClient: Client;
  message: Omit<InferEntitiesRequestMessage, "cookie">;
  user: User;
}) => {
  const { requestUuid, payload: userArguments } = message;

  const sendResponse = (
    payload: InferEntitiesReturn,
    status: "bad-request" | "complete",
  ) => {
    const responseMessage: InferEntitiesResponseMessage = {
      payload,
      requestUuid,
      status,
      type: "inference-response",
    };
    socket.send(JSON.stringify(responseMessage));
  };

  if (inferEntitiesUserArgumentKeys.some((key) => !(key in userArguments))) {
    sendResponse(
      {
        code: StatusCode.InvalidArgument,
        contents: [],
        message: `Invalid request body – expected an object containing all of ${inferEntitiesUserArgumentKeys.join(
          ", ",
        )}`,
      },
      "bad-request",
    );
    return;
  }

  if (!inferenceModelNames.includes(userArguments.model)) {
    sendResponse(
      {
        code: StatusCode.InvalidArgument,
        contents: [],
        message: `Invalid request body – expected 'model' to be one of ${inferenceModelNames.join(
          ", ",
        )}`,
      },
      "bad-request",
    );
    return;
  }

  try {
    const status = await temporalClient.workflow.execute<
      (params: InferEntitiesCallerParams) => Promise<InferEntitiesReturn>
    >("inferEntities", {
      taskQueue: "ai",
      args: [
        {
          authentication: { actorId: user.accountId },
          requestUuid,
          userArguments,
        },
      ],
      memo: {
        userAccountId: user.accountId,
      },
      workflowId: requestUuid,
      retry: {
        maximumAttempts: 1,
      },
    });

    sendResponse(status, "complete");
  } catch (err) {
    console.log(JSON.stringify(err, null, 2));
    const errorCause = (err as WorkflowFailedError).cause?.cause as
      | ApplicationFailure
      | undefined;

    const errorDetails = errorCause?.details?.[0] as
      | InferEntitiesReturn
      | undefined;

    if (errorDetails) {
      sendResponse(errorDetails, "complete");
    } else {
      sendResponse(
        {
          code: StatusCode.Internal,
          contents: [],
          message: `Unexpected error from Infer Entities workflow: ${
            (err as Error).message
          }`,
        },
        "complete",
      );
    }
  }
};
