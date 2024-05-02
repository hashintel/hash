import type http from "node:http";

import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type { Logger } from "@local/hash-backend-utils/logger";
import type {
  ExternalInputRequestMessage,
  InferenceWebsocketClientMessage,
  InferEntitiesRequestMessage,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { externalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/signals";
import type { Client } from "@temporalio/client";
import type { GraphQLResolveInfo } from "graphql";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

import { getUserAndSession } from "../auth/create-auth-handlers";
import type { ImpureGraphContext } from "../graph/context-types";
import type { User } from "../graph/knowledge/system-types/user";
import { getFlowRuns } from "../graphql/resolvers/flows/runs";
import { handleCancelInferEntitiesRequest } from "./infer-entities-websocket/handle-cancel-infer-entities-request";
import { handleInferEntitiesRequest } from "./infer-entities-websocket/handle-infer-entities-request";

const inferEntitiesMessageHandler = async ({
  socket,
  temporalClient,
  message,
  user,
}: {
  socket: WebSocket;
  temporalClient: Client;
  message: DistributiveOmit<InferenceWebsocketClientMessage, "cookie">;
  user: User;
}) => {
  switch (message.type) {
    case "inference-request":
      await handleInferEntitiesRequest({
        socket,
        temporalClient,
        message,
        user,
      });
      return;
    case "cancel-inference-request":
      await handleCancelInferEntitiesRequest({
        socket,
        temporalClient,
        message,
        user,
      });
      return;
    case "external-input-response": {
      const { flowUuid, payload } = message;
      const handle = temporalClient.workflow.getHandle(flowUuid);
      await handle.signal(externalInputResponseSignal, payload);
    }
  }
  socket.send(`Unrecognized message '${JSON.stringify(message)}'`);
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
    const checkForInputRequests = async () => {
      const flowRuns = await getFlowRuns(
        {},
        {},
        { temporal: temporalClient },
        {} as GraphQLResolveInfo,
      );
      for (const flowRun of flowRuns) {
        for (const inputRequest of flowRun.inputRequests) {
          if (!inputRequest.resolved) {
            const requestMessage: ExternalInputRequestMessage = {
              flowUuid: flowRun.runId,
              payload: inputRequest,
              type: "external-input-request",
            };
            socket.send(JSON.stringify(requestMessage));
          }
        }
      }
    };

    const flowStatusInterval = setInterval(() => {
      void checkForInputRequests();
    }, 10_00);

    socket.on("close", () => {
      clearInterval(flowStatusInterval);
    });

    socket.on(
      "message",
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (rawMessage) => {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- doesn't matter for comparison
        if (rawMessage.toString() === "ping") {
          return;
        }

        const parsedMessage = JSON.parse(
          // eslint-disable-next-line @typescript-eslint/no-base-to-string -- doesn't matter for comparison
          rawMessage.toString(),
        ) as InferEntitiesRequestMessage; // @todo validate this

        const { cookie, ...message } = parsedMessage;

        const { user } = await getUserAndSession({
          context,
          cookie,
          logger,
        }).catch(() => {
          return { user: null };
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
