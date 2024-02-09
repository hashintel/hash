import http from "node:http";

import { DistributiveOmit } from "@local/advanced-types/distribute";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  InferenceWebsocketRequestMessage,
  InferEntitiesRequestMessage,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { Client } from "@temporalio/client";
import { WebSocket, WebSocketServer } from "ws";

import { getUserAndSession } from "../auth/create-auth-handlers";
import { ImpureGraphContext } from "../graph/context-types";
import { User } from "../graph/knowledge/system-types/user";
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
  message: DistributiveOmit<InferenceWebsocketRequestMessage, "cookie">;
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
