/* oxlint-disable eslint/no-await-in-loop -- A response stream can only be read sequentially. */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
  type Provider,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import {
  createFlueChatTransport,
  snapshotToUiMessages,
} from "@hashintel/brunch-agent-transport-aisdk";
const ELICITATION_SKILL_NAME = "elicitation";

import {
  brunchRoutes,
  brunchSignals,
  brunchTools,
} from "@hashintel/brunch-agent";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { installFauxProvider } from "../../src/evaluations/install-faux-provider.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";

import type { PetrinautChatResult } from "./petrinaut-chat-result";
import type { UIMessage, UIMessageChunk } from "ai";

const RUNBOOK_SKILL_NAME = "sdcpn-modelling";
const clientToolNames: ReadonlySet<string> = new Set([
  brunchTools.readPetrinautDocs,
]);
const question = "Which documentation page should we inspect next?";

const principalKey = "principal-mission-1";
const conversationId = "conversation-mission-1";
const identity = { principalKey, conversationId };
const instanceId = flueConversationIdFrom(identity);
process.env.BRUNCH_DEV_DB_PATH = join(
  await mkdtemp(join(tmpdir(), "brunch-chat-")),
  "conversations.db",
);
const chunksFrom = async (
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const result = await reader.read();
    if (result.done) return chunks;
    chunks.push(result.value);
  }
};

const userTextFromHistory = (
  messages: ReturnType<typeof snapshotToUiMessages>,
): string =>
  messages
    .filter((message) => message.role === "user")
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

const faux = fauxProvider({ provider: "openai" });
let providerCallCount = 0;
installFauxProvider({
  ...faux.provider,
  streamSimple(model, context, options) {
    providerCallCount += 1;
    return faux.provider.streamSimple(model, context, options);
  },
} satisfies Provider);
const application = await loadBuiltBrunchApplication();

try {
  const app = application;
  const appTransport: typeof fetch = async (input, init) =>
    app.fetch(input instanceof Request ? input : new Request(input, init));
  const historyClient = createFlueClient({
    url: `http://brunch.local/agents/${brunchRoutes.chatAgent}/${instanceId}`,
    fetch: appTransport,
    headers: agentOwnershipHeaders(identity),
  });
  const panelTransport = createFlueChatTransport({
    client: historyClient,
    clientToolNames,
  });
  const projectHistory = (
    snapshot: Awaited<ReturnType<typeof historyClient.history>>,
  ) =>
    snapshotToUiMessages(snapshot, {
      clientToolNames,
    });

  const packagedSkillResourcePathFrom = (
    context: unknown,
    fileName: string,
  ): string => {
    const serialized = JSON.stringify(context);
    const match = serialized.match(
      new RegExp(
        `/\\.flue/packaged-skills/[^"\\s\\\\]+/${fileName.replace(".", "\\.")}`,
      ),
    );
    if (match === null) {
      throw new Error(`activate_skill briefing did not advertise ${fileName}`);
    }
    return match[0];
  };

  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxThinking("Load the modelling runbook skill."),
        fauxToolCall(
          brunchTools.activateSkill,
          { name: RUNBOOK_SKILL_NAME },
          { id: "tool-skill-1" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxThinking("The job skill routes universal judgment to core."),
        fauxToolCall(
          brunchTools.activateSkill,
          { name: ELICITATION_SKILL_NAME },
          { id: "tool-skill-2" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    (context) =>
      fauxAssistantMessage(
        [
          fauxThinking("Read the SDCPN-specific elicitation profile."),
          fauxToolCall(
            brunchTools.readSkillResource,
            {
              path: packagedSkillResourcePathFrom(
                context,
                "references/profile.md",
              ),
            },
            { id: "tool-resource-1" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
    fauxAssistantMessage(
      [
        fauxThinking("Confirm the server path, then read the guide."),
        fauxText("Checking the server, then the docs."),
        fauxToolCall(
          brunchTools.ping,
          { note: "health" },
          { id: "tool-ping-1" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxThinking("The ping returned. Read the user guide next."),
        fauxToolCall(
          brunchTools.readPetrinautDocs,
          { doc: "ai-assistant" },
          { id: "tool-doc-1" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([
      fauxText(
        `The guide says the assistant can read its own documentation pages. ${question}`,
      ),
    ]),
    fauxAssistantMessage([
      fauxText("A duplicate client-tool result ran another turn."),
    ]),
    fauxAssistantMessage([fauxText("A duplicate delivery ran another turn.")]),
  ]);

  const userMessage = {
    id: "user-mission-1",
    role: "user",
    parts: [{ type: "text", text: "Run the FE-1435 transport probe." }],
  } satisfies UIMessage;

  const initialChunks = await chunksFrom(
    await panelTransport.sendMessages({
      trigger: "submit-message",
      chatId: conversationId,
      messageId: undefined,
      messages: [userMessage],
      abortSignal: undefined,
    }),
  );
  const startChunk = initialChunks.find((chunk) => chunk.type === "start");
  const pingCall =
    initialChunks.find(
      (
        chunk,
      ): chunk is Extract<UIMessageChunk, { type: "tool-input-available" }> =>
        chunk.type === "tool-input-available" &&
        chunk.toolName === brunchTools.ping,
    ) ?? null;
  const activateSkillCall =
    initialChunks.find(
      (
        chunk,
      ): chunk is Extract<UIMessageChunk, { type: "tool-input-available" }> =>
        chunk.type === "tool-input-available" &&
        chunk.toolName === brunchTools.activateSkill,
    ) ?? null;
  const readSkillResourceCall =
    initialChunks.find(
      (
        chunk,
      ): chunk is Extract<UIMessageChunk, { type: "tool-input-available" }> =>
        chunk.type === "tool-input-available" &&
        chunk.toolName === brunchTools.readSkillResource,
    ) ?? null;
  const pingOutputChunk = initialChunks.find(
    (chunk) =>
      chunk.type === "tool-output-available" &&
      chunk.toolCallId === pingCall?.toolCallId,
  );
  const clientToolCall =
    initialChunks.find(
      (
        chunk,
      ): chunk is Extract<UIMessageChunk, { type: "tool-input-available" }> =>
        chunk.type === "tool-input-available" &&
        chunk.toolName === brunchTools.readPetrinautDocs,
    ) ?? null;

  const pendingHistory = projectHistory(await historyClient.history());
  const pendingHistoryClientToolState = pendingHistory
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        "toolCallId" in part && part.toolCallId === clientToolCall?.toolCallId,
    );

  if (startChunk?.type !== "start" || clientToolCall === null) {
    throw new Error("initial stream did not reach the client-tool pause");
  }
  const resumeMessages = [
    userMessage,
    {
      id: startChunk.messageId,
      role: "assistant" as const,
      parts: [
        {
          type: `tool-${brunchTools.readPetrinautDocs}`,
          toolCallId: clientToolCall.toolCallId,
          state: "output-available",
          input: { doc: "ai-assistant" },
          output:
            "# AI Assistant\nThe assistant can read its own documentation pages.",
        },
      ],
    },
  ] as UIMessage[];
  const questionResponseCallStart = providerCallCount;
  const resumedChunks = await chunksFrom(
    await panelTransport.sendMessages({
      trigger: "submit-message",
      chatId: conversationId,
      messageId: startChunk.messageId,
      messages: resumeMessages,
      abortSignal: undefined,
    }),
  );
  const snapshot = await historyClient.history();
  const userEntryIds = snapshot.messages
    .filter((message) => message.role === "user" && message.purpose === "user")
    .map((message) => message.id);
  const clientToolResultCount = snapshot.messages.filter(
    (message) =>
      message.purpose === "dispatch" &&
      message.signal?.tagName === brunchSignals.clientToolResult,
  ).length;
  const historyMessages = projectHistory(snapshot);

  const result: PetrinautChatResult = {
    messageId: startChunk.messageId,
    partIds: initialChunks
      .filter(
        (chunk) =>
          chunk.type === "reasoning-start" || chunk.type === "text-start",
      )
      .map((chunk) => chunk.id),
    reasoning: initialChunks
      .filter((chunk) => chunk.type === "reasoning-delta")
      .map((chunk) => chunk.delta)
      .join(""),
    text: initialChunks
      .filter((chunk) => chunk.type === "text-delta")
      .map((chunk) => chunk.delta)
      .join(""),
    pingCall,
    pingOutput:
      pingOutputChunk && pingOutputChunk.type === "tool-output-available"
        ? pingOutputChunk.output
        : null,
    clientToolCall,
    clientToolOutputsOnInitial: initialChunks.filter(
      (chunk) =>
        chunk.type === "tool-output-available" &&
        chunk.toolCallId === clientToolCall.toolCallId,
    ),
    initialFinish: initialChunks.at(-1),
    pendingHistoryClientToolState:
      pendingHistoryClientToolState === undefined ||
      !("state" in pendingHistoryClientToolState)
        ? undefined
        : pendingHistoryClientToolState.state,
    resumedText: resumedChunks
      .filter((chunk) => chunk.type === "text-delta")
      .map((chunk) => chunk.delta)
      .join(""),
    resumedFinish: resumedChunks.at(-1),
    questionResponseProviderCalls:
      providerCallCount - questionResponseCallStart,
    historyUserEntryCount: userEntryIds.length,
    historyClientToolResultCount: clientToolResultCount,
    historyUserText: userTextFromHistory(historyMessages),
    activateSkillCall,
    readSkillResourceCall,
  };
  process.stdout.write(`PETRINAUT_CHAT_RESULT ${JSON.stringify(result)}\n`);
} finally {
  await application.stop();
}
