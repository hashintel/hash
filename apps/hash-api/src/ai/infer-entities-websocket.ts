import { WebSocketServer } from "ws";

import {
  getFlowRunEntityById,
  getFlowRuns,
} from "@local/hash-backend-utils/flows";
import {
  automaticBrowserInferenceFlow,
  manualBrowserInferenceFlow,
} from "@local/hash-isomorphic-utils/flows/definitions/browser-plugin-flow-definitions";
import { externalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/signals";
import { validateFlowInputs } from "@local/hash-isomorphic-utils/flows/validate-payloads";

import { getUserAndSession } from "../auth/create-auth-handlers";
import { FlowRunStatus } from "../graphql/api-types.gen";
import { handleCancelInferEntitiesRequest } from "./infer-entities-websocket/handle-cancel-infer-entities-request";
import { handleInferEntitiesRequest } from "./infer-entities-websocket/handle-infer-entities-request";

import type { GraphApi, ImpureGraphContext } from "../graph/context-types";
import type { User } from "../graph/knowledge/system-types/user";
import type { Logger } from "@local/hash-backend-utils/logger";
import type {
  ExternalInputWebsocketRequestMessage,
  InferenceWebsocketClientMessage,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type { ExternalInputResponseSignal } from "@local/hash-isomorphic-utils/flows/types";
import type { Client } from "@temporalio/client";
import type http from "node:http";
import type { WebSocket } from "ws";

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

      const { webId: _webId, ...flowInputs } = message.payload;

      /* The code that seeds the flow the request starts, which a test keeps equal to its seeded definition. */
      const { flowDefinition } =
        message.type === "manual-inference-request"
          ? manualBrowserInferenceFlow
          : automaticBrowserInferenceFlow;

      const invalidFlowInputMessage = validateFlowInputs({
        inputDefinitions: flowDefinition.inputs,
        flowInputs,
      });

      if (invalidFlowInputMessage) {
        socket.send(invalidFlowInputMessage);
        return;
      }

      await handleInferEntitiesRequest({
        graphApiClient,
        temporalClient,
        message,
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
      });

      for (const {
        flowRunEntityId,
        openInputRequests,
      } of openFlowRuns.flowRuns) {
        for (const inputRequest of openInputRequests) {
          const requestMessage: ExternalInputWebsocketRequestMessage = {
            flowRunEntityId,
            payload: inputRequest,
            type: "external-input-request",
          };
          socket.send(JSON.stringify(requestMessage));
        }
      }
      return;
    }
    case "external-input-response": {
      const { flowRunEntityId, payload } = message;

      const flow = await getFlowRunEntityById({
        userAuthentication: { actorId: user.accountId },
        flowRunEntityId,
        graphApiClient,
      });

      if (!flow) {
        return;
      }

      const handle = temporalClient.workflow.getHandle(
        flow.properties["https://hash.ai/@h/types/property-type/workflow-id/"],
      );
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
        typeof message.flowRunEntityId === "string" &&
        typeof message.requestUuid === "string" &&
        hasValidOptionalCookie(message)
      );
    case "check-for-external-input-requests":
      return hasValidOptionalCookie(message);
    case "external-input-response":
      return (
        typeof message.flowRunEntityId === "string" &&
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
      let authenticatedSession:
        | { cookie: string; expiresAt: number; user: User }
        | undefined;
      let sessionExpiryTimeout: ReturnType<typeof setTimeout> | undefined;
      let authenticationInProgress: Promise<User | undefined> | undefined;

      const closeUnauthenticated = () => {
        if (socket.readyState === socket.OPEN) {
          socket.send("Unauthenticated");
          socket.close(1008, "Unauthenticated");
        }
      };

      const scheduleSessionExpiry = () => {
        clearTimeout(sessionExpiryTimeout);

        if (!authenticatedSession) {
          return;
        }

        const remainingMs = authenticatedSession.expiresAt - Date.now();

        if (remainingMs <= 0) {
          closeUnauthenticated();
          return;
        }

        // Kratos sessions can outlive Node's maximum setTimeout delay.
        sessionExpiryTimeout = setTimeout(
          scheduleSessionExpiry,
          Math.min(remainingMs, 2_147_483_647),
        );
      };

      const authenticate = async (cookie: string | undefined) => {
        if (!cookie) {
          return undefined;
        }

        // Serialize authentication to prevent concurrent updates
        if (authenticationInProgress) {
          return authenticationInProgress;
        }

        const authPromise = (async () => {
          const { user, session } = await getUserAndSession({
            context,
            cookie,
            logger,
          }).catch(() => ({ user: undefined, session: undefined }));

          const expiresAt = Date.parse(session?.expires_at ?? "");

          if (
            socket.readyState !== socket.OPEN ||
            !user ||
            !session?.active ||
            !Number.isFinite(expiresAt) ||
            expiresAt <= Date.now() ||
            (authenticatedSession &&
              (authenticatedSession.expiresAt <= Date.now() ||
                authenticatedSession.user.accountId !== user.accountId))
          ) {
            return undefined;
          }

          // Only retain credentials after live validation, and never switch actors.
          authenticatedSession = { cookie, expiresAt, user };
          scheduleSessionExpiry();
          return user;
        })();

        authenticationInProgress = authPromise;
        const result = await authPromise;
        authenticationInProgress = undefined;
        return result;
      };

      socket.once("close", () => {
        clearTimeout(unauthenticatedTimeout);
        clearTimeout(sessionExpiryTimeout);
      });

      if (request.headers.cookie) {
        await authenticate(request.headers.cookie);
      }

      const unauthenticatedTimeout = setTimeout(() => {
        if (!authenticatedSession) {
          closeUnauthenticated();
        }
      }, UNAUTHENTICATED_CONNECTION_TIMEOUT_MS);

      let messageCount = 0;
      let messageWindowStart = Date.now();

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

          // Revalidate before every operation, including when no new cookie is sent.
          const user = await authenticate(
            parsedMessage.cookie ?? authenticatedSession?.cookie,
          );

          if (!user || socket.readyState !== socket.OPEN) {
            closeUnauthenticated();
            return;
          }

          void inferEntitiesMessageHandler({
            graphApiClient: context.graphApi,
            socket,
            temporalClient,
            message: parsedMessage,
            user,
          });
        },
      );
    })();
  });
};
