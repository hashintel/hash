import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { sqlite, start } from "@flue/runtime/node";
import { createFlueClient, FlueApiError } from "@flue/sdk";

import { ASK_TOOL_NAME } from "@hashintel/brunch-agent/client-tools";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

import {
  ACTIVATE_SKILL_TOOL_NAME,
  CHAT_MODEL_ID,
  ChatAgent,
  STUB_SKILL_NAME,
} from "../src/agents/chat-agent.ts";
import { applyCaptureSweep } from "../src/capture-sweep.ts";
import { CLIENT_TOOL_RESULT_SIGNAL } from "../src/client-tool.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation-identity.ts";
import { formatFlueTranscript } from "../src/flue-transcript.ts";
import { CHAT_AGENT_ROUTE } from "../src/routes.ts";
import { PING_TOOL_NAME } from "../src/tools/ping.ts";
import { READ_PETRINAUT_DOC_TOOL_NAME } from "../src/tools/read-petrinaut-doc.ts";

import type {
  PetrinautChatResult,
  PetrinautResumeResult,
} from "./petrinaut-chat-result";
import type { UIMessageChunk } from "ai";

const principalKey = "principal-mission-1";
const conversationId = "conversation-mission-1";
const identity = { principalKey, conversationId };
const instanceId = flueConversationIdFrom(identity);
const latestNetDefinitionFixture = {
  title: "Invoice review conveyor",
  definition: {
    places: [
      {
        id: "incoming-invoices",
        name: "Incoming invoices",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 100,
        y: 100,
      },
      {
        id: "approved-invoices",
        name: "Approved invoices",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 500,
        y: 100,
      },
    ],
    transitions: [
      {
        id: "review-invoice",
        name: "Review invoice",
        inputArcs: [
          { placeId: "incoming-invoices", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "approved-invoices", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: "return true;",
        transitionKernelCode: "",
        x: 300,
        y: 125,
      },
    ],
    types: [],
    parameters: [],
    differentialEquations: [],
    subnets: [],
    componentInstances: [],
  },
  extensions: {
    colors: false,
    stochasticity: false,
    dynamics: false,
    parameters: false,
    subnets: false,
  },
} as const;
const dbPath =
  process.env.BRUNCH_CHAT_DB_PATH ??
  (await mkdtemp(join(tmpdir(), "brunch-chat-")));
const dbFile = dbPath.endsWith(".db")
  ? dbPath
  : join(dbPath, "conversations.db");

process.env.BRUNCH_TRANSPORT_AISDK_INSPECT ??= "1";

const chunksFrom = (body: string): UIMessageChunk[] =>
  body
    .trim()
    .split("\n\n")
    .slice(0, -1)
    .map((frame) => JSON.parse(frame.slice("data: ".length)) as UIMessageChunk);

const userTextFromHistory = (
  messages: readonly {
    role?: string;
    parts?: { type?: string; text?: string }[];
  }[],
): string =>
  messages
    .filter((message) => message.role === "user")
    .flatMap((message) => message.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");

const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: CHAT_MODEL_ID, reasoning: true }],
});

const flue = await start({
  agents: [ChatAgent],
  providers: [faux.provider],
  db: sqlite(dbFile),
});

try {
  const { default: app } = await import("../src/app.ts");
  const appTransport: typeof fetch = async (input, init) =>
    app.fetch(input instanceof Request ? input : new Request(input, init));
  const historyClient = createFlueClient({
    url: `http://brunch.local/agents/${CHAT_AGENT_ROUTE}/${instanceId}`,
    fetch: appTransport,
    headers: agentOwnershipHeaders(identity),
  });

  if (process.env.BRUNCH_RESUME_PHASE === "1") {
    const snapshot = await historyClient.history();
    const historyGet = await app.fetch(
      new Request(
        `http://brunch.test/api/chat?id=${encodeURIComponent(conversationId)}`,
        {
          method: "GET",
          headers: { "x-brunch-principal": principalKey },
        },
      ),
    );
    const historyBody = (await historyGet.json()) as {
      messages?: {
        role?: string;
        parts?: { type?: string; text?: string }[];
      }[];
    };
    const result: PetrinautResumeResult = {
      historyGetStatus: historyGet.status,
      historyUserText: userTextFromHistory(historyBody.messages ?? []),
      transcript: formatFlueTranscript(snapshot),
    };
    process.stdout.write(`PETRINAUT_RESUME_RESULT ${JSON.stringify(result)}\n`);
  } else {
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxThinking("Load the mount confirmation skill."),
          fauxToolCall(
            ACTIVATE_SKILL_TOOL_NAME,
            { name: STUB_SKILL_NAME },
            { id: "tool-skill-1" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(
        [
          fauxThinking("Confirm the server path, then read the guide."),
          fauxText("Checking the server, then the docs."),
          fauxToolCall(
            PING_TOOL_NAME,
            { note: "health" },
            { id: "tool-ping-1" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(
        [
          fauxThinking(
            "The ping returned. Read the current net and user guide next.",
          ),
          fauxToolCall(
            getLatestNetDefinitionToolName,
            {},
            { id: "tool-net-1" },
          ),
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
          fauxThinking(
            "Use the current net context before the first interview question.",
          ),
          fauxText(
            "The Invoice review conveyor moves Incoming invoices through Review invoice into Approved invoices. The guide says the assistant can read its own documentation pages.",
          ),
          fauxToolCall(
            ASK_TOOL_NAME,
            {
              question:
                "What should happen when review cannot approve an invoice?",
            },
            { id: "tool-ask-1" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([
        fauxThinking("Use the correlated client-tool answer."),
        fauxText(
          "I received your answer: send it to manual review. The Petrinaut canvas was not modified.",
        ),
      ]),
      fauxAssistantMessage([
        fauxText("A duplicate client-tool result ran another turn."),
      ]),
      fauxAssistantMessage([
        fauxText("A duplicate delivery ran another turn."),
      ]),
    ]);

    const fixturePath = fileURLToPath(
      new URL(
        "../../../libs/@hashintel/brunch-agent/packages/transport-aisdk/test/fixtures/panel-initial.post.json",
        import.meta.url,
      ),
    );
    const { readFile } = await import("node:fs/promises");
    const initialBody = JSON.parse(await readFile(fixturePath, "utf8")) as {
      id: string;
      messages: { id: string; role: string; parts: unknown[] }[];
      trigger: string;
    };
    initialBody.id = conversationId;
    const userMessage = initialBody.messages[0];
    if (userMessage === undefined) {
      throw new Error("panel-initial.post.json is missing the user message");
    }
    userMessage.parts = [
      {
        type: "text",
        text: "Interview this Petri net. What does it do?",
      },
    ];

    const initialResponse = await app.fetch(
      new Request("http://brunch.test/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-brunch-principal": principalKey,
          "x-request-id": "request-mission-1",
        },
        body: JSON.stringify(initialBody),
      }),
    );
    const initialChunks = chunksFrom(await initialResponse.text());
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
    const latestNetDefinitionCall =
      initialChunks.find(
        (
          chunk,
        ): chunk is Extract<UIMessageChunk, { type: "tool-input-available" }> =>
          chunk.type === "tool-input-available" &&
          chunk.toolName === getLatestNetDefinitionToolName,
      ) ?? null;

    const pendingHistoryResponse = await app.fetch(
      new Request(
        `http://brunch.test/api/chat?id=${encodeURIComponent(conversationId)}`,
        {
          method: "GET",
          headers: { "x-brunch-principal": principalKey },
        },
      ),
    );
    const pendingHistoryBody = (await pendingHistoryResponse.json()) as {
      messages?: {
        parts?: { toolCallId?: string; state?: string }[];
      }[];
    };
    const pendingHistoryClientToolState = pendingHistoryBody.messages
      ?.flatMap((message) => message.parts ?? [])
      .find((part) => part.toolCallId === clientToolCall?.toolCallId)?.state;
    const pendingHistoryLatestNetDefinitionState = pendingHistoryBody.messages
      ?.flatMap((message) => message.parts ?? [])
      .find(
        (part) => part.toolCallId === latestNetDefinitionCall?.toolCallId,
      )?.state;

    const resumeBody = {
      id: conversationId,
      trigger: "submit-message",
      messageId: startChunk?.messageId,
      messages: [
        userMessage,
        {
          id: startChunk?.messageId,
          role: "assistant",
          parts: [
            {
              type: `tool-${getLatestNetDefinitionToolName}`,
              toolCallId: latestNetDefinitionCall?.toolCallId,
              state: "output-available",
              input: {},
              output: latestNetDefinitionFixture,
            },
            {
              type: `tool-${READ_PETRINAUT_DOC_TOOL_NAME}`,
              toolCallId: clientToolCall?.toolCallId,
              state: "output-available",
              input: { doc: "ai-assistant" },
              output:
                "# AI Assistant\nThe assistant can read its own documentation pages.",
            },
          ],
        },
      ],
    };
    const resumeResponse = await app.fetch(
      new Request("http://brunch.test/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-brunch-principal": principalKey,
          "x-request-id": "request-mission-1-resume",
        },
        body: JSON.stringify(resumeBody),
      }),
    );
    const resumedChunks = chunksFrom(await resumeResponse.text());
    const askCall =
      resumedChunks.find(
        (
          chunk,
        ): chunk is Extract<UIMessageChunk, { type: "tool-input-available" }> =>
          chunk.type === "tool-input-available" &&
          chunk.toolName === ASK_TOOL_NAME,
      ) ?? null;
    const askChunkIndex = resumedChunks.findIndex(
      (chunk) =>
        chunk.type === "tool-input-available" &&
        chunk.toolName === ASK_TOOL_NAME,
    );
    const resumedTextBeforeAsk = resumedChunks
      .slice(0, askChunkIndex === -1 ? resumedChunks.length : askChunkIndex)
      .filter((chunk) => chunk.type === "text-delta")
      .map((chunk) => chunk.delta)
      .join("");
    const pendingAskHistoryResponse = await app.fetch(
      new Request(
        `http://brunch.test/api/chat?id=${encodeURIComponent(conversationId)}`,
        {
          method: "GET",
          headers: { "x-brunch-principal": principalKey },
        },
      ),
    );
    const pendingAskHistoryBody = (await pendingAskHistoryResponse.json()) as {
      messages?: {
        parts?: { toolCallId?: string; state?: string }[];
      }[];
    };
    const pendingHistoryAskState = pendingAskHistoryBody.messages
      ?.flatMap((message) => message.parts ?? [])
      .find((part) => part.toolCallId === askCall?.toolCallId)?.state;
    const answerResumeBody = {
      id: conversationId,
      trigger: "submit-message",
      messageId: startChunk?.messageId,
      messages: [
        userMessage,
        {
          id: startChunk?.messageId,
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: ASK_TOOL_NAME,
              toolCallId: askCall?.toolCallId,
              state: "output-available",
              input: askCall?.input,
              output: { answer: "Send it to manual review." },
            },
          ],
        },
      ],
    };
    const answerResumeResponse = await app.fetch(
      new Request("http://brunch.test/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-brunch-principal": principalKey,
          "x-request-id": "request-mission-1-ask-resume",
        },
        body: JSON.stringify(answerResumeBody),
      }),
    );
    const answerResumeChunks = chunksFrom(await answerResumeResponse.text());
    const retriedResumeResponse = await app.fetch(
      new Request("http://brunch.test/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-brunch-principal": principalKey,
          "x-request-id": "request-mission-1-resume-retry",
        },
        body: JSON.stringify(resumeBody),
      }),
    );
    await retriedResumeResponse.text();
    const retriedResponse = await app.fetch(
      new Request("http://brunch.test/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-brunch-principal": principalKey,
          "x-request-id": "request-mission-1-retry",
        },
        body: JSON.stringify(initialBody),
      }),
    );
    await retriedResponse.text();
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
    const firstSweep = await applyCaptureSweep(identity, userEntryIds);
    const secondSweep = await applyCaptureSweep(identity, userEntryIds);
    const interviewerToolNames = [
      ...new Set(
        snapshot.messages.flatMap((message) =>
          message.parts
            .filter((part) => part.type === "dynamic-tool")
            .map((part) => part.toolName),
        ),
      ),
    ];
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
    const historyGet = await app.fetch(
      new Request(
        `http://brunch.test/api/chat?id=${encodeURIComponent(conversationId)}`,
        {
          method: "GET",
          headers: { "x-brunch-principal": principalKey },
        },
      ),
    );
    const historyBody = (await historyGet.json()) as {
      messages?: {
        role?: string;
        parts?: { type?: string; text?: string }[];
      }[];
    };
    const foreignHistory = await app.fetch(
      new Request(
        `http://brunch.test/api/chat?id=${encodeURIComponent(conversationId)}`,
        {
          method: "GET",
          headers: { "x-brunch-principal": "principal-other" },
        },
      ),
    );
    const foreignBody = (await foreignHistory.json()) as {
      messages?: unknown[];
    };

    const result: PetrinautChatResult = {
      status: initialResponse.status,
      messageId: startChunk?.messageId,
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
          chunk.toolCallId === clientToolCall?.toolCallId,
      ),
      latestNetDefinitionCall,
      latestNetDefinitionOutputsOnInitial: initialChunks.filter(
        (chunk) =>
          chunk.type === "tool-output-available" &&
          chunk.toolCallId === latestNetDefinitionCall?.toolCallId,
      ),
      initialFinish: initialChunks.at(-1),
      pendingHistoryClientToolState,
      pendingHistoryLatestNetDefinitionState,
      resumedStatus: resumeResponse.status,
      resumedText: resumedChunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.delta)
        .join(""),
      resumedTextBeforeAsk,
      resumedFinish: resumedChunks.at(-1),
      askCall,
      askToolOutputsBeforeResume: resumedChunks.filter(
        (chunk) =>
          chunk.type === "tool-output-available" &&
          chunk.toolCallId === askCall?.toolCallId,
      ),
      pendingHistoryAskState,
      answerResumeStatus: answerResumeResponse.status,
      answerResumeText: answerResumeChunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.delta)
        .join(""),
      answerResumeFinish: answerResumeChunks.at(-1),
      retriedStatus: retriedResponse.status,
      retriedResumeStatus: retriedResumeResponse.status,
      historyUserEntryCount: userEntryIds.length,
      historyClientToolResultCount: clientToolResultCount,
      historyGetStatus: historyGet.status,
      historyUserText: userTextFromHistory(historyBody.messages ?? []),
      foreignHistoryMessages: foreignBody.messages?.length ?? -1,
      unauthenticatedHistoryStatus,
      foreignAgentHistoryStatus,
      transcript: formatFlueTranscript(snapshot),
      instanceId,
      dbPath: dbFile,
      activateSkillCall,
      interviewerToolNames,
      captureUserText: userTextFromHistory(
        snapshot.messages.map((message) => ({
          role: message.role,
          parts: message.parts,
        })),
      ),
      captureIds: firstSweep.captures.map((capture) => capture.id),
      recaptureIds: secondSweep.captures.map((capture) => capture.id),
      skippedDedupKeys: secondSweep.skippedDedupKeys,
      capturePayloads: firstSweep.captures.map((capture) => capture.payload),
      captureExcerpts: firstSweep.captures.map((capture) => capture.excerpt),
    };
    process.stdout.write(`PETRINAUT_CHAT_RESULT ${JSON.stringify(result)}\n`);
  }
} finally {
  await flue.stop();
}
