import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { setProvider } from "@flue/runtime";
import { createFlueClient, FlueApiError } from "@flue/sdk";

import { READ_PETRINAUT_DOC_TOOL_NAME } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import {
  createFlueChatTransport,
  snapshotToUiMessages,
} from "@hashintel/brunch-agent-transport-aisdk";
import { ELICITATION_SKILL_NAME } from "@hashintel/brunch-agent/flue";
import {
  BRUNCH_QUESTION_DATA_NAME,
  BRUNCH_QUESTION_TOOL_NAME,
} from "@hashintel/brunch-agent/question-marker";

import { PING_TOOL_NAME } from "../../src/agents/chat-agent/tools/ping.ts";
import { applyCaptureSweep } from "../../src/capture/apply-sweep.ts";
import {
  clientToolNames,
  CLIENT_TOOL_RESULT_SIGNAL,
} from "../../src/conversation/client-tools.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../../src/conversation/identity.ts";
import { formatFlueTranscript } from "../../src/conversation/transcript.ts";
import { loadBuiltBrunchApplication } from "../../src/evaluations/runbook/load-built-application.ts";
import { CHAT_AGENT_ROUTE } from "../../src/http/routes.ts";

import type {
  PetrinautChatResult,
  PetrinautResumeResult,
} from "./petrinaut-chat-result";
import type { UIMessage, UIMessageChunk } from "ai";

const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";
const CHAT_MODEL_ID = "claude-haiku-4-5";
const RUNBOOK_SKILL_NAME = "sdcpn-modelling";
const READ_SKILL_RESOURCE_TOOL_NAME = "read_skill_resource";
const question = "Which documentation page should we inspect next?";

const principalKey = "principal-mission-1";
const conversationId = "conversation-mission-1";
const identity = { principalKey, conversationId };
const instanceId = flueConversationIdFrom(identity);
const dbPath =
  process.env.BRUNCH_CHAT_DB_PATH ??
  (await mkdtemp(join(tmpdir(), "brunch-chat-")));
const dbFile = dbPath.endsWith(".db")
  ? dbPath
  : join(dbPath, "conversations.db");

process.env.BRUNCH_CHAT_MODEL = CHAT_MODEL_ID;
process.env.BRUNCH_DEV_DB_PATH = dbFile;
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

const questionMarkerFromHistory = (
  messages: ReturnType<typeof snapshotToUiMessages>,
): unknown => {
  const marker = messages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === `data-${BRUNCH_QUESTION_DATA_NAME}` && "data" in part,
    );
  return marker !== undefined && "data" in marker ? marker.data : undefined;
};

const questionMarkerFromChunks = (
  chunks: readonly UIMessageChunk[],
): unknown => {
  const marker = chunks.find(
    (chunk) =>
      chunk.type === `data-${BRUNCH_QUESTION_DATA_NAME}` && "data" in chunk,
  );
  return marker !== undefined && "data" in marker ? marker.data : undefined;
};

const questionToolVisibleInHistory = (
  messages: ReturnType<typeof snapshotToUiMessages>,
): boolean =>
  messages
    .flatMap((message) => message.parts)
    .some((part) => part.type === `tool-${BRUNCH_QUESTION_TOOL_NAME}`);

const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: CHAT_MODEL_ID, reasoning: true }],
});
const providerToolNames = new Set<string>();
const recordProviderToolNames = (context: {
  readonly tools?: readonly { readonly name: string }[];
}): void => {
  for (const tool of context.tools ?? []) {
    providerToolNames.add(tool.name);
  }
};
setProvider(faux.provider);
const application = await loadBuiltBrunchApplication();

try {
  const app = application;
  const appTransport: typeof fetch = async (input, init) =>
    app.fetch(input instanceof Request ? input : new Request(input, init));
  const historyClient = createFlueClient({
    url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
    fetch: appTransport,
    headers: agentOwnershipHeaders(identity),
  });
  const panelTransport = createFlueChatTransport({
    client: historyClient,
    clientToolNames,
    hiddenToolNames: new Set([BRUNCH_QUESTION_TOOL_NAME]),
  });
  const projectHistory = (
    snapshot: Awaited<ReturnType<typeof historyClient.history>>,
  ) =>
    snapshotToUiMessages(snapshot, {
      clientToolNames,
      hiddenToolNames: new Set([BRUNCH_QUESTION_TOOL_NAME]),
    });

  if (process.env.BRUNCH_RESUME_PHASE === "1") {
    const snapshot = await historyClient.history();
    const historyMessages = projectHistory(snapshot);
    const result: PetrinautResumeResult = {
      historyGetStatus: 200,
      historyUserText: userTextFromHistory(historyMessages),
      questionMarkerHistory: questionMarkerFromHistory(historyMessages),
      questionToolVisibleHistory: questionToolVisibleInHistory(historyMessages),
      transcript: formatFlueTranscript(snapshot),
    };
    process.stdout.write(`PETRINAUT_RESUME_RESULT ${JSON.stringify(result)}\n`);
  } else {
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
        throw new Error(
          `activate_skill briefing did not advertise ${fileName}`,
        );
      }
      return match[0];
    };
    const firstCurrentNetSnapshot = {
      title: "SIR epidemic model",
      definition: {
        places: [
          { id: "susceptible", name: "Susceptible" },
          { id: "infected", name: "Infected" },
          { id: "recovered", name: "Recovered" },
        ],
        transitions: [],
      },
    };
    const secondCurrentNetSnapshot = {
      title: "SIR epidemic model (revised)",
      definition: {
        places: [
          { id: "susceptible", name: "Susceptible" },
          { id: "infected", name: "Infected" },
          { id: "recovered", name: "Recovered cases" },
        ],
        transitions: [],
      },
    };

    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxThinking("Load the modelling runbook skill."),
          fauxToolCall(
            ACTIVATE_SKILL_TOOL_NAME,
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
            ACTIVATE_SKILL_TOOL_NAME,
            { name: ELICITATION_SKILL_NAME },
            { id: "tool-skill-2" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      (context) => {
        recordProviderToolNames(context);
        return fauxAssistantMessage(
          [
            fauxThinking("Read the SDCPN-specific elicitation profile."),
            fauxToolCall(
              READ_SKILL_RESOURCE_TOOL_NAME,
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
        );
      },
      (context) => {
        recordProviderToolNames(context);
        const modelRequest = JSON.stringify(context);
        for (const requiredPromptText of [
          "Before answering a user request about this model or the current, open, visible, or existing net",
          "getLatestNetDefinition",
          "unless its client-tool result is already present in the current continuation",
        ]) {
          if (!modelRequest.includes(requiredPromptText)) {
            throw new Error(`model request omitted: ${requiredPromptText}`);
          }
        }
        return fauxAssistantMessage(
          [
            fauxThinking("Confirm the server path, then read the guide."),
            fauxText("Checking the server, then the docs."),
            fauxToolCall(
              PING_TOOL_NAME,
              { note: "health" },
              { id: "tool-ping-1" },
            ),
            fauxToolCall(
              "getLatestNetDefinition",
              {},
              { id: "tool-current-net-1" },
            ),
          ],
          { stopReason: "toolUse" },
        );
      },
      fauxAssistantMessage(
        [
          fauxThinking("The ping returned. Read the user guide next."),
          fauxToolCall(
            READ_PETRINAUT_DOC_TOOL_NAME,
            { doc: "ai-assistant" },
            { id: "tool-doc-1" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(
        [
          fauxToolCall(
            BRUNCH_QUESTION_TOOL_NAME,
            { question },
            { id: "tool-question-1" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      (context) => {
        recordProviderToolNames(context);
        const modelRequest = JSON.stringify(context);
        if (!modelRequest.includes(firstCurrentNetSnapshot.title)) {
          throw new Error(
            "first grounding result was not returned to the model",
          );
        }
        return fauxAssistantMessage([
          fauxText(
            `The guide says the assistant can read its own documentation pages. ${question} The ${firstCurrentNetSnapshot.title} contains Susceptible, Infected, and Recovered.`,
          ),
        ]);
      },
      (context) => {
        recordProviderToolNames(context);
        const modelRequest = JSON.stringify(context);
        if (modelRequest.includes("Review the current SIR net again.")) {
          return fauxAssistantMessage(
            [
              fauxToolCall(
                "getLatestNetDefinition",
                {},
                { id: "tool-current-net-2" },
              ),
            ],
            { stopReason: "toolUse" },
          );
        }
        return fauxAssistantMessage([
          fauxText("A duplicate client-tool result ran another turn."),
        ]);
      },
      (context) => {
        recordProviderToolNames(context);
        const modelRequest = JSON.stringify(context);
        if (
          context.tools?.some(({ name }) => name === "getLatestNetDefinition")
        ) {
          return fauxAssistantMessage(
            [
              fauxToolCall(
                "getLatestNetDefinition",
                {},
                { id: "tool-current-net-duplicate" },
              ),
            ],
            { stopReason: "toolUse" },
          );
        }
        if (modelRequest.includes("Review the current SIR net again.")) {
          if (!modelRequest.includes(secondCurrentNetSnapshot.title)) {
            throw new Error(
              "second grounding result was not returned to the model",
            );
          }
          return fauxAssistantMessage([
            fauxText(
              `The current review uses ${secondCurrentNetSnapshot.title}, including Recovered cases.`,
            ),
          ]);
        }
        return fauxAssistantMessage([
          fauxText("A duplicate delivery ran another turn."),
        ]);
      },
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
          chunk.toolName === PING_TOOL_NAME,
      ) ?? null;
    const activateSkillCall =
      initialChunks.find(
        (
          chunk,
        ): chunk is Extract<UIMessageChunk, { type: "tool-input-available" }> =>
          chunk.type === "tool-input-available" &&
          chunk.toolName === ACTIVATE_SKILL_TOOL_NAME,
      ) ?? null;
    const readSkillResourceCall =
      initialChunks.find(
        (
          chunk,
        ): chunk is Extract<UIMessageChunk, { type: "tool-input-available" }> =>
          chunk.type === "tool-input-available" &&
          chunk.toolName === READ_SKILL_RESOURCE_TOOL_NAME,
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
          chunk.toolName === READ_PETRINAUT_DOC_TOOL_NAME,
      ) ?? null;
    const currentNetCallsFromChunks = (chunks: readonly UIMessageChunk[]) =>
      chunks.filter(
        (
          chunk,
        ): chunk is Extract<UIMessageChunk, { type: "tool-input-available" }> =>
          chunk.type === "tool-input-available" &&
          chunk.toolName === "getLatestNetDefinition",
      );
    const firstCurrentNetCalls = currentNetCallsFromChunks(initialChunks);
    const firstCurrentNetCall = firstCurrentNetCalls.at(0) ?? null;

    const pendingHistory = projectHistory(await historyClient.history());
    const pendingHistoryClientToolState = pendingHistory
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          "toolCallId" in part &&
          part.toolCallId === clientToolCall?.toolCallId,
      );

    if (
      startChunk?.type !== "start" ||
      clientToolCall === null ||
      firstCurrentNetCalls.length !== 1 ||
      firstCurrentNetCall === null
    ) {
      throw new Error("initial stream did not reach the client-tool pause");
    }
    const resumeMessages = [
      userMessage,
      {
        id: startChunk.messageId,
        role: "assistant" as const,
        parts: [
          {
            type: "tool-getLatestNetDefinition",
            toolCallId: firstCurrentNetCall.toolCallId,
            state: "output-available",
            input: {},
            output: firstCurrentNetSnapshot,
          },
          {
            type: `tool-${READ_PETRINAUT_DOC_TOOL_NAME}`,
            toolCallId: clientToolCall.toolCallId,
            state: "output-available",
            input: { doc: "ai-assistant" },
            output:
              "# AI Assistant\nThe assistant can read its own documentation pages.",
          },
        ],
      },
    ] as UIMessage[];
    const resumedChunks = await chunksFrom(
      await panelTransport.sendMessages({
        trigger: "submit-message",
        chatId: conversationId,
        messageId: startChunk.messageId,
        messages: resumeMessages,
        abortSignal: undefined,
      }),
    );
    const firstResumedCurrentNetCalls =
      currentNetCallsFromChunks(resumedChunks);
    if (firstResumedCurrentNetCalls.length !== 0) {
      throw new Error(
        "first continuation repeated getLatestNetDefinition after the initial read",
      );
    }
    const secondUserMessage = {
      id: "user-mission-2",
      role: "user",
      parts: [{ type: "text", text: "Review the current SIR net again." }],
    } satisfies UIMessage;
    const secondInitialChunks = await chunksFrom(
      await panelTransport.sendMessages({
        trigger: "submit-message",
        chatId: conversationId,
        messageId: undefined,
        messages: [userMessage, secondUserMessage],
        abortSignal: undefined,
      }),
    );
    const secondStartChunk = secondInitialChunks.find(
      (chunk) => chunk.type === "start",
    );
    const secondCurrentNetCalls =
      currentNetCallsFromChunks(secondInitialChunks);
    const secondCurrentNetCall = secondCurrentNetCalls.at(0) ?? null;
    if (
      secondStartChunk?.type !== "start" ||
      secondCurrentNetCalls.length !== 1 ||
      secondCurrentNetCall === null
    ) {
      throw new Error(
        "second stream did not reach the current-net client-tool pause",
      );
    }
    const secondResumedChunks = await chunksFrom(
      await panelTransport.sendMessages({
        trigger: "submit-message",
        chatId: conversationId,
        messageId: secondStartChunk.messageId,
        messages: [
          userMessage,
          {
            id: startChunk.messageId,
            role: "assistant" as const,
            parts: resumeMessages[1]!.parts,
          },
          secondUserMessage,
          {
            id: secondStartChunk.messageId,
            role: "assistant" as const,
            parts: [
              {
                type: "tool-getLatestNetDefinition",
                toolCallId: secondCurrentNetCall.toolCallId,
                state: "output-available",
                input: {},
                output: secondCurrentNetSnapshot,
              },
            ],
          },
        ] as UIMessage[],
        abortSignal: undefined,
      }),
    );
    const secondResumedCurrentNetCalls =
      currentNetCallsFromChunks(secondResumedChunks);
    if (secondResumedCurrentNetCalls.length !== 0) {
      throw new Error(
        "second continuation repeated getLatestNetDefinition after the initial read",
      );
    }
    const snapshot = await historyClient.history();
    const userEntryIds = snapshot.messages
      .filter(
        (message) => message.role === "user" && message.purpose === "user",
      )
      .map((message) => message.id);
    const clientToolResultCount = snapshot.messages.filter(
      (message) =>
        message.purpose === "dispatch" &&
        message.signal?.tagName === CLIENT_TOOL_RESULT_SIGNAL,
    ).length;
    const clientToolResultSignals = snapshot.messages
      .filter(
        (message) =>
          message.purpose === "dispatch" &&
          message.signal?.tagName === CLIENT_TOOL_RESULT_SIGNAL,
      )
      .map((message) => {
        const body = message.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("");
        const parsed: unknown = JSON.parse(body);
        if (!Array.isArray(parsed)) {
          throw new Error("client-tool-result signal body was not an array");
        }
        const normalized: unknown[] = [];
        for (const entry of parsed) normalized.push(entry);
        return normalized;
      });
    const clientToolResultMatches = (
      toolCall: Extract<UIMessageChunk, { type: "tool-input-available" }>,
      output: unknown,
    ): boolean =>
      clientToolResultSignals.some((signal) =>
        signal.some((entry) => {
          if (typeof entry !== "object" || entry === null) return false;
          const result = entry as {
            toolCallId?: unknown;
            output?: unknown;
          };
          return (
            result.toolCallId === toolCall.toolCallId &&
            JSON.stringify(result.output) === JSON.stringify(output)
          );
        }),
      );
    if (
      !clientToolResultMatches(firstCurrentNetCall, firstCurrentNetSnapshot) ||
      !clientToolResultMatches(secondCurrentNetCall, secondCurrentNetSnapshot)
    ) {
      throw new Error(
        "client-tool-result signals did not contain both current-net snapshots",
      );
    }
    const firstSweep = await applyCaptureSweep(
      identity,
      userEntryIds,
      appTransport,
    );
    const secondSweep = await applyCaptureSweep(
      identity,
      userEntryIds,
      appTransport,
    );
    const interviewerToolNames = [...providerToolNames];
    let unauthenticatedHistoryStatus = 0;
    try {
      await createFlueClient({
        url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
        fetch: appTransport,
      }).history();
    } catch (error) {
      unauthenticatedHistoryStatus =
        error instanceof FlueApiError ? error.status : -1;
    }
    let foreignAgentHistoryStatus = 0;
    try {
      await createFlueClient({
        url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
        fetch: appTransport,
        headers: agentOwnershipHeaders({
          principalKey: "principal-other",
          conversationId,
        }),
      }).history();
    } catch (error) {
      foreignAgentHistoryStatus =
        error instanceof FlueApiError ? error.status : -1;
    }
    const historyMessages = projectHistory(snapshot);
    const historyUserTexts = historyMessages
      .filter((message) => message.role === "user")
      .map((message) =>
        message.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
      );
    const legacyRoute = await app.fetch(
      new Request("http://brunch.test/api/chat"),
    );

    const result: PetrinautChatResult = {
      status: 200,
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
      firstCurrentNetCall,
      firstCurrentNetSnapshot,
      firstGroundingText: resumedChunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.delta)
        .join(""),
      secondCurrentNetCall,
      secondCurrentNetSnapshot,
      secondGroundingText: secondResumedChunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.delta)
        .join(""),
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
      resumedStatus: 200,
      resumedText: resumedChunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.delta)
        .join(""),
      resumedFinish: resumedChunks.at(-1),
      questionMarkerLive: questionMarkerFromChunks(resumedChunks),
      questionMarkerHistory: questionMarkerFromHistory(historyMessages),
      questionToolVisibleLive: resumedChunks.some(
        (chunk) =>
          chunk.type === "tool-input-available" &&
          chunk.toolName === BRUNCH_QUESTION_TOOL_NAME,
      ),
      questionToolVisibleHistory: questionToolVisibleInHistory(historyMessages),
      historyUserEntryCount: userEntryIds.length,
      historyClientToolResultCount: clientToolResultCount,
      historyGetStatus: 200,
      historyUserText: userTextFromHistory(historyMessages),
      historyUserTexts,
      clientToolResultSignals,
      legacyRouteStatus: legacyRoute.status,
      unauthenticatedHistoryStatus,
      foreignAgentHistoryStatus,
      transcript: formatFlueTranscript(snapshot),
      instanceId,
      dbPath: dbFile,
      activateSkillCall,
      readSkillResourceCall,
      interviewerToolNames,
      captureUserText: userTextFromHistory(historyMessages),
      captureIds: firstSweep.captures.map((capture) => capture.id),
      recaptureIds: secondSweep.captures.map((capture) => capture.id),
      skippedDedupKeys: secondSweep.skippedDedupKeys,
      capturePayloads: firstSweep.captures.map((capture) => capture.payload),
      captureExcerpts: firstSweep.captures.map((capture) => capture.excerpt),
    };
    process.stdout.write(`PETRINAUT_CHAT_RESULT ${JSON.stringify(result)}\n`);
  }
} finally {
  await application.stop();
}
