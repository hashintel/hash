import type http from "node:http";

import type { WebSocket , WebSocketServer } from "ws";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import {
  getFlowRunEntityById,
  getFlowRuns,
} from "@local/hash-backend-utils/flows";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import type {
  ExternalInputWebsocketRequestMessage,
  InferenceWebsocketClientMessage,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { externalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/signals";
import type { ExternalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/types";
import type { Client } from "@temporalio/client";

import { getUserAndSession } from "../auth/create-auth-handlers";
import type { GraphApi, ImpureGraphContext } from "../graph/context-types";
import type { User } from "../graph/knowledge/system-types/user";
import { FlowRunStatus } from "../graphql/api-types.gen";

import { handleCancelInferEntitiesRequest } from "./infer-entities-websocket/handle-cancel-infer-entities-request";
import { handleInferEntitiesRequest } from "./infer-entities-websocket/handle-infer-entities-request";

const inferEntitiesMessageHandler = async ({
  socket,
  graphApiClient,
  temporalClient,
  message,
  user,
}: {
  graphApiClient: GraphApi;
  socket: WebSocket;
  temporalClient: Client;
  message: DistributiveOmit<InferenceWebsocketClientMessage, "cookie">;
  user: User;
}) => {
  switch (message.type) {
    case "automatic-inference-request":
    case "manual-inference-request": {
      await handleInferEntitiesRequest({
        graphApiClient,
        temporalClient,
        message,
        user,
      });

      return;
    }
    case "cancel-inference-request": {
      await handleCancelInferEntitiesRequest({
        graphApiClient,
        temporalClient,
        message,
        user,
      });

      return;
    }
    case "check-for-external-input-requests": {
      const openFlowRuns = await getFlowRuns({
        authentication: { actorId: user.accountId },
        filters: { executionStatus: FlowRunStatus.Running },
        graphApiClient,
        includeDetails: true,
        temporalClient,
      });

      for (const flowRun of openFlowRuns) {
        for (const inputRequest of flowRun.inputRequests) {
          if (!inputRequest.resolvedAt) {
            const requestMessage: ExternalInputWebsocketRequestMessage = {
              workflowId: flowRun.flowRunId,
              payload: inputRequest,
              type: "external-input-request",
            };

            socket.send(JSON.stringify(requestMessage));
          }
        }
      }

      return;
    }
    case "external-input-response": {
      const { workflowId, payload } = message;

      const flow = await getFlowRunEntityById({
        userAuthentication: { actorId: user.accountId },
        flowRunId: workflowId as EntityUuid,
        graphApiClient,
      });

      if (!flow) {
        return;
      }

      const handle = temporalClient.workflow.getHandle(workflowId);

      await handle.signal<[ExternalInputResponseSignal]>(
        externalInputResponseSignal,
        { ...payload, resolvedBy: user.accountId },
      );

      return;
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
        ) as InferenceWebsocketClientMessage; // @todo validate this

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
          graphApiClient: context.graphApi,
          socket,
          temporalClient,
          message,
          user,
        });
      },
    );
  });
};
