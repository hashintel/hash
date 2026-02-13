import type http from "node:http";

import type { EntityUuid } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import {
  getFlowRunEntityById,
  getFlowRuns,
} from "@local/hash-backend-utils/flows";
import type { Logger } from "@local/hash-backend-utils/logger";
import type {
  ExternalInputWebsocketRequestMessage,
  InferenceWebsocketClientMessage,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { externalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/signals";
import type { ExternalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/types";
import type { Client } from "@temporalio/client";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

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
  storageProvider,
  user,
}: {
  graphApiClient: GraphApi;
  socket: WebSocket;
  storageProvider: FileStorageProvider;
  temporalClient: Client;
  message: InferenceWebsocketClientMessage;
  user: User;
}) => {
  switch (message.type) {
    case "automatic-inference-request":
    case "manual-inference-request": {
      if (!user.enabledFeatureFlags.includes("ai")) {
        socket.send("Flows are not enabled for this user");
        return;
      }

      await handleInferEntitiesRequest({
        graphApiClient,
        temporalClient,
        message,
        storageProvider,
        user,
      });
      return;
    }
    case "cancel-inference-request":
      await handleCancelInferEntitiesRequest({
        graphApiClient,
        temporalClient,
        message,
        user,
      });
      return;
    case "check-for-external-input-requests": {
      const openFlowRuns = await getFlowRuns({
        authentication: { actorId: user.accountId },
        filters: { executionStatus: FlowRunStatus.Running },
        graphApiClient,
        includeDetails: true,
        storageProvider,
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

const MAX_CONNECTIONS_PER_IP = 10;
const MAX_MESSAGES_PER_MINUTE = 120;
const UNAUTHENTICATED_CONNECTION_TIMEOUT_MS = 5_000;

const activeConnectionsByIp = new Map<string, number>();

const hasValidOptionalCookie = (message: Record<string, unknown>): boolean =>
  typeof message.cookie === "undefined" || typeof message.cookie === "string";

const isInferenceWebsocketClientMessage = (
  value: unknown,
): value is InferenceWebsocketClientMessage => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Record<string, unknown>;

  switch (message.type) {
    case "automatic-inference-request":
    case "manual-inference-request":
      return (
        typeof message.payload === "object" &&
        message.payload !== null &&
        typeof message.requestUuid === "string" &&
        hasValidOptionalCookie(message)
      );
    case "cancel-inference-request":
      return (
        typeof message.flowRunId === "string" &&
        typeof message.requestUuid === "string" &&
        hasValidOptionalCookie(message)
      );
    case "check-for-external-input-requests":
      return hasValidOptionalCookie(message);
    case "external-input-response":
      return (
        typeof message.workflowId === "string" &&
        typeof message.payload === "object" &&
        message.payload !== null &&
        hasValidOptionalCookie(message)
      );
    default:
      return false;
  }
};

const decrementActiveConnectionCount = (ipAddress: string): void => {
  const activeConnections = activeConnectionsByIp.get(ipAddress);

  if (!activeConnections || activeConnections <= 1) {
    activeConnectionsByIp.delete(ipAddress);
    return;
  }

  activeConnectionsByIp.set(ipAddress, activeConnections - 1);
};

export const openInferEntitiesWebSocket = ({
  context,
  httpServer,
  logger,
  storageProvider,
  temporalClient,
}: {
  context: ImpureGraphContext;
  httpServer: http.Server;
  logger: Logger;
  storageProvider: FileStorageProvider;
  temporalClient: Client;
}) => {
  const wss = new WebSocketServer({
    server: httpServer,
  });

  wss.on("connection", (socket, request) => {
    const ipAddress = request.socket.remoteAddress ?? "unknown";
    const activeConnections = activeConnectionsByIp.get(ipAddress) ?? 0;

    if (activeConnections >= MAX_CONNECTIONS_PER_IP) {
      socket.send("Too many active connections");
      socket.close(1013, "Too many active connections");
      return;
    }

    // Increment count and register close listener synchronously, before any
    // async work, to avoid race conditions with concurrent connections from
    // the same IP and to prevent leaked counts if the socket closes during
    // authentication.
    activeConnectionsByIp.set(ipAddress, activeConnections + 1);

    socket.once("close", () => {
      decrementActiveConnectionCount(ipAddress);
    });

    void (async () => {
      let authenticatedUser: User | null = null;

      const upgradeCookie = request.headers.cookie;

      if (upgradeCookie) {
        const { user } = await getUserAndSession({
          context,
          cookie: upgradeCookie,
          logger,
        }).catch(() => {
          return { user: null };
        });

        authenticatedUser = user ?? null;
      }

      let messageCount = 0;
      let messageWindowStart = Date.now();

      const unauthenticatedTimeout = setTimeout(() => {
        if (!authenticatedUser) {
          socket.send("Unauthenticated");
          socket.close(1008, "Unauthenticated");
        }
      }, UNAUTHENTICATED_CONNECTION_TIMEOUT_MS);

      socket.once("close", () => {
        clearTimeout(unauthenticatedTimeout);
      });

      socket.on(
        "message",
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async (rawMessage) => {
          const now = Date.now();

          if (now - messageWindowStart >= 60_000) {
            messageWindowStart = now;
            messageCount = 0;
          }

          messageCount += 1;

          if (messageCount > MAX_MESSAGES_PER_MINUTE) {
            socket.send("Rate limit exceeded");
            socket.close(1008, "Rate limit exceeded");
            return;
          }

          // eslint-disable-next-line @typescript-eslint/no-base-to-string -- doesn't matter for comparison
          if (rawMessage.toString() === "ping") {
            return;
          }

          let parsedMessage: unknown;

          try {
            parsedMessage = JSON.parse(
              // eslint-disable-next-line @typescript-eslint/no-base-to-string -- doesn't matter for comparison
              rawMessage.toString(),
            );
          } catch {
            socket.send("Invalid JSON");
            socket.close(1003, "Invalid JSON");
            return;
          }

          if (!isInferenceWebsocketClientMessage(parsedMessage)) {
            socket.send("Invalid message shape");
            socket.close(1003, "Invalid message shape");
            return;
          }

          if (!authenticatedUser) {
            const { cookie } = parsedMessage;

            if (!cookie) {
              socket.send("Unauthenticated");
              socket.close(1008, "Unauthenticated");
              return;
            }

            const { user } = await getUserAndSession({
              context,
              cookie,
              logger,
            }).catch(() => {
              return { user: null };
            });

            if (!user) {
              socket.send("Unauthenticated");
              socket.close(1008, "Unauthenticated");
              return;
            }

            authenticatedUser = user;
          }

          const user = authenticatedUser;

          void inferEntitiesMessageHandler({
            graphApiClient: context.graphApi,
            socket,
            storageProvider,
            temporalClient,
            message: parsedMessage,
            user,
          });
        },
      );
    })();
  });
};
