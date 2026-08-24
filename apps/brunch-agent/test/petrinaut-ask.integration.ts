/**
 * FE-1449 end-to-end proof over the committed application route: the actual
 * elicitor invokes `brunch_ask`, the wire holds the ask open as an awaiting
 * client tool, the correlated return POST resumes the same Flue conversation
 * and produces the next visible turn — and a duplicate of that submission is
 * refused before any dispatch.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { start } from "@flue/runtime/node";

import {
  GHERKIN_MODEL_ID,
  GherkinElicitor,
} from "../src/agents/gherkin-elicitor.ts";

const targetDirectory = await mkdtemp(join(tmpdir(), "brunch-petrinaut-ask-"));
process.env.BRUNCH_DEV_TARGET_DOCUMENT_DIR = targetDirectory;
process.env.BRUNCH_TRANSPORT_AISDK_INSPECT = "1";

const faux = fauxProvider({
  provider: "anthropic",
  models: [{ id: GHERKIN_MODEL_ID, reasoning: true }],
});
faux.setResponses([
  fauxAssistantMessage(
    [
      fauxThinking("One question at a time; suspend for the answer."),
      fauxToolCall(
        "brunch_ask",
        { question: "What outcome should this process reliably produce?" },
        { id: "toolu_fe1449_ask" },
      ),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage([
    fauxThinking("The reply is mechanically bound to the pending affordance."),
    fauxText("Payment settled — who initiates the checkout?"),
  ]),
  // The settlement check nudges one more turn after the answered ask.
  fauxAssistantMessage([
    fauxText("The settled prefix is captured; nothing further to sweep."),
  ]),
]);

const flue = await start({
  agents: [GherkinElicitor],
  providers: [faux.provider],
});

type StreamChunk = Record<string, unknown> & { readonly type: string };

const chunksFrom = (body: string): StreamChunk[] =>
  body
    .trim()
    .split("\n\n")
    .slice(0, -1)
    .map((frame) => JSON.parse(frame.slice("data: ".length)) as StreamChunk);

try {
  const { default: app } = await import("../src/app.ts");
  const postChat = async (
    requestId: string,
    body: unknown,
  ): Promise<Response> =>
    app.fetch(
      new Request("http://brunch.test/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify(body),
      }),
    );

  const conversationId = "conversation-fe1449-ask";
  const initial = await postChat("request-fe1449-initial", {
    id: conversationId,
    trigger: "submit-message",
    messages: [
      {
        id: "user-fe1449-1",
        role: "user",
        parts: [{ type: "text", text: "Help me model checkout." }],
      },
    ],
  });
  const initialChunks = chunksFrom(await initial.text());
  const askCall = initialChunks.find(
    (chunk) => chunk.type === "tool-input-available",
  );

  const returnBody = {
    id: conversationId,
    trigger: "submit-message",
    messageId: "assistant-fe1449-panel",
    messages: [
      {
        id: "assistant-fe1449-panel",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "brunch_ask",
            toolCallId: askCall?.toolCallId,
            state: "output-available",
            input: askCall?.input,
            output: { answer: "A confirmed order with payment settled." },
          },
        ],
      },
    ],
  };
  const resumed = await postChat("request-fe1449-return", returnBody);
  const resumedChunks = chunksFrom(await resumed.text());

  const duplicate = await postChat("request-fe1449-duplicate", returnBody);

  process.stdout.write(
    `PETRINAUT_ASK_RESULT ${JSON.stringify({
      initialStatus: initial.status,
      askCall,
      initialToolOutputs: initialChunks.filter(
        (chunk) => chunk.type === "tool-output-available",
      ),
      initialFinish: initialChunks.at(-1),
      resumedStatus: resumed.status,
      resumedText: resumedChunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.delta)
        .join(""),
      resumedFinish: resumedChunks.at(-1),
      duplicateStatus: duplicate.status,
      duplicateBody: (await duplicate.json()) as unknown,
    })}\n`,
  );
} finally {
  await flue.stop();
  await rm(targetDirectory, { recursive: true, force: true });
}
