import http from "node:http";

import { Logger } from "@local/hash-backend-utils/logger";
import {
  inferenceModelNames,
  InferEntitiesCallerParams,
  InferEntitiesRequestMessage,
  InferEntitiesResponseMessage,
  InferEntitiesReturn,
  inferEntitiesUserArgumentKeys,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { StatusCode } from "@local/status";
import { ApplicationFailure, Client } from "@temporalio/client";
import { WorkflowFailedError } from "@temporalio/client/src/errors";
import { WebSocket, WebSocketServer } from "ws";

import { getUserAndSession } from "../auth/create-auth-handlers";
import { ImpureGraphContext } from "../graph/context-types";
import { User } from "../graph/knowledge/system-types/user";
import { genId } from "../util";

declare module "http" {
  interface IncomingMessage {
    user?: User | undefined;
  }
}

const inferEntitiesMessageHandler = async ({
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

  const sendResponse = (payload: InferEntitiesReturn) => {
    const responseMessage: InferEntitiesResponseMessage = {
      payload,
      requestUuid,
      type: "inference-response",
    };
    socket.send(JSON.stringify(responseMessage));
  };

  if (inferEntitiesUserArgumentKeys.some((key) => !(key in userArguments))) {
    sendResponse({
      code: StatusCode.InvalidArgument,
      contents: [],
      message: `Invalid request body – expected an object containing all of ${inferEntitiesUserArgumentKeys.join(
        ", ",
      )}`,
    });
    return;
  }

  if (!inferenceModelNames.includes(userArguments.model)) {
    sendResponse({
      code: StatusCode.InvalidArgument,
      contents: [],
      message: `Invalid request body – expected 'model' to be one of ${inferenceModelNames.join(
        ", ",
      )}`,
    });
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
          userArguments,
        },
      ],
      workflowId: `inferEntities-${genId()}`,
      retry: {
        maximumAttempts: 1,
      },
    });

    sendResponse(status);
  } catch (err) {
    const errorCause = (err as WorkflowFailedError).cause?.cause as
      | ApplicationFailure
      | undefined;

    const errorDetails = errorCause?.details?.[0] as
      | InferEntitiesReturn
      | undefined;

    if (!errorDetails) {
      sendResponse({
        code: StatusCode.Internal,
        contents: [],
        message: `Unexpected error from Infer Entities workflow: ${
          (err as Error).message
        }`,
      });

      return;
    }

    sendResponse(errorDetails);
  }
};

export const openInferEntitiesWebSocket = ({
  context,
  httpServer,
  logger,
  temporalClient,
}: {
  context: ImpureGraphContext;
  httpServer: http.Server;
  logger: Logger;
  temporalClient: Client;
}) => {
  const wss = new WebSocketServer({
    server: httpServer,
  });

  wss.on("connection", (socket) => {
    socket.on(
      "message",
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (rawMessage) => {
        if (rawMessage.toString() === "ping") {
          return;
        }

        const parsedMessage = JSON.parse(
          rawMessage.toString(),
        ) as InferEntitiesRequestMessage; // @todo validate this

        const { cookie, ...message } = parsedMessage;

        const { user } = await getUserAndSession({
          context,
          cookie,
          logger,
        });

        if (!user) {
          socket.send("Unauthenticated");
          socket.close();
          return;
        }

        void inferEntitiesMessageHandler({
          socket,
          temporalClient,
          message,
          user,
        });
      },
    );
  });
};
