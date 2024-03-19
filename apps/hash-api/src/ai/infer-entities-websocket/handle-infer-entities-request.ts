import type {
  GetResultsFromCancelledInferenceRequestQuery,
  InferEntitiesCallerParams,
  InferEntitiesRequestMessage,
  InferEntitiesResponseMessage,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  inferenceModelNames,
  inferEntitiesUserArgumentKeys,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { StatusCode } from "@local/status";
import type {
  ApplicationFailure,
  Client,
  WorkflowFailedError,
} from "@temporalio/client";
import type { WebSocket } from "ws";

import type { User } from "../../graph/knowledge/system-types/user";
import { logger } from "../../logger";

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
    status: InferEntitiesResponseMessage["status"],
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

    console.log("Returning results from workflow", status);

    sendResponse(
      status,
      status.code === StatusCode.Cancelled ? "user-cancelled" : "complete",
    );
  } catch (err) {
    const handle = temporalClient.workflow.getHandle(requestUuid);

    try {
      // See if we can get the results from the cancelled workflow via a query
      const partialResultsFromCancellation =
        await handle.query<InferEntitiesReturn>(
          "getResultsFromCancelledInference" satisfies GetResultsFromCancelledInferenceRequestQuery["name"],
        );
      sendResponse(partialResultsFromCancellation, "user-cancelled");
      return;
    } catch (queryError) {
      logger.error(
        "Error calling AI inference for results from cancelled workflow:",
        err,
      );
      // fallback to the error handling below
    }

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
