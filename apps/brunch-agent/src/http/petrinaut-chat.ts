/** Application composition for Petrinaut's stock AI SDK chat transport. */

import { init } from "@flue/runtime";
import { createFlueClient, type FlueConversationSnapshot } from "@flue/sdk";

import {
  createAiSdkChatHandler,
  type ChatResumeInput,
  type ChatTurnInput,
  type ConversationIdentity,
  type TransportInspectionEvent,
} from "@hashintel/brunch-agent-transport-aisdk";

import { ChatAgent } from "../agents/chat-agent/agent.ts";
import {
  clientToolNames,
  CLIENT_TOOL_RESULT_SIGNAL,
} from "../conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../conversation/identity.ts";
import { snapshotToUiMessages } from "../conversation/transcript.ts";
import { createFlueUiStream } from "../conversation/ui-stream.ts";
import { defaultPanelOrigins } from "./local-origins.ts";
import { CHAT_AGENT_ROUTE } from "./routes.ts";

import type { UIMessageChunk } from "ai";

const inspect =
  process.env.BRUNCH_TRANSPORT_AISDK_INSPECT === "1"
    ? (event: TransportInspectionEvent): void => {
        process.stdout.write(`TRANSPORT_AISDK ${JSON.stringify(event)}\n`);
      }
    : undefined;

const appTransport: typeof fetch = async (input, init) => {
  const { default: app } = await import("../app.ts");
  return app.fetch(input instanceof Request ? input : new Request(input, init));
};

const conversationUrl = (instanceId: string): string =>
  `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${instanceId}`;

const historyClient = (identity: ConversationIdentity) =>
  createFlueClient({
    url: conversationUrl(flueConversationIdFrom(identity)),
    fetch: appTransport,
    headers: agentOwnershipHeaders(identity),
  });

const streamTurn = async (
  instanceId: string,
  dispatch: Parameters<ReturnType<typeof init>["dispatch"]>[0],
  write: (chunk: UIMessageChunk) => void,
): Promise<void> => {
  const agent = init(ChatAgent, { id: instanceId });
  const receipt = await agent.dispatch(dispatch);
  const projector = createFlueUiStream({
    submissionId: receipt.submissionId,
    clientToolNames,
    write,
  });
  await agent.read(receipt, { onEvent: (chunk) => projector.accept(chunk) });
};

const runUserTurn = (
  input: ChatTurnInput,
  write: (chunk: UIMessageChunk) => void,
): Promise<void> =>
  streamTurn(
    flueConversationIdFrom(input),
    { message: input.userMessage.text, idempotencyKey: input.idempotencyKey },
    write,
  );

const runClientToolResume = (
  input: ChatResumeInput,
  write: (chunk: UIMessageChunk) => void,
): Promise<void> =>
  streamTurn(
    flueConversationIdFrom(input),
    {
      message: {
        kind: "signal",
        type: CLIENT_TOOL_RESULT_SIGNAL,
        tagName: CLIENT_TOOL_RESULT_SIGNAL,
        body: JSON.stringify(input.toolResults),
        attributes: {
          toolCallIds: input.toolResults
            .map((result) => result.toolCallId)
            .join(","),
        },
      },
      idempotencyKey: input.idempotencyKey,
    },
    write,
  );

const loadHistory = async (
  identity: ConversationIdentity,
): Promise<{ readonly messages: readonly unknown[] }> => {
  let snapshot: FlueConversationSnapshot;
  try {
    snapshot = await historyClient(identity).history();
  } catch {
    return { messages: [] };
  }
  return { messages: snapshotToUiMessages(snapshot) };
};

export const petrinautChatHandler = createAiSdkChatHandler({
  allowedOrigins: (
    process.env.BRUNCH_PETRINAUT_ORIGINS ?? defaultPanelOrigins.join(",")
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  inspect,
  runTurn: runUserTurn,
  resumeTurn: runClientToolResume,
  loadHistory,
});
