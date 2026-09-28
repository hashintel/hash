import {
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { afterAll, describe, expect, test } from "vitest";

import { createFlueChatTransport } from "../client/chat-transport";
import { snapshotToUiMessages } from "../client/transcript";
import { reduceUiMessageChunks } from "../shared/ai-sdk-oracle";
import {
  harnessTools,
  startFlueHarness,
  unwrapHarnessEnvelope,
} from "./flue-harness";

import type { FlueChatTransportOptions } from "../client/chat-transport";
import type { UIMessage, UIMessageChunk } from "ai";

const harness = await startFlueHarness();
afterAll(() => harness.stop());

const projection = {
  clientToolNames: new Set([harnessTools.widget]),
  mapToolOutput: unwrapHarnessEnvelope,
};

const readAll = async (
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> => {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
};

/** Send one real user turn, then reopen the same conversation from history. */
const runTurn = async (
  text: string,
  options: Partial<FlueChatTransportOptions> = {},
) => {
  const client = harness.client();
  const turnProjection = { ...projection, ...options };
  const transport = createFlueChatTransport({ client, ...turnProjection });
  const chunks = await readAll(
    await transport.sendMessages({
      trigger: "submit-message",
      chatId: "conversation",
      messageId: undefined,
      messages: [
        { id: "user-1", role: "user", parts: [{ type: "text", text }] },
      ],
      abortSignal: undefined,
    }),
  );
  const live = await reduceUiMessageChunks(chunks);
  const history = await client.history();
  return {
    chunks,
    live,
    reopened: snapshotToUiMessages(history, turnProjection),
  };
};

/**
 * The accepted live-only details: Flue history keeps no step boundary, and
 * the optional reasoning part id is the live stream's own part id.
 */
const withoutLiveOnlyDetails = (message: UIMessage | undefined) => {
  if (message === undefined) return undefined;
  const comparable = structuredClone(message);
  comparable.parts = comparable.parts.filter(
    (part) => part.type !== "step-start",
  );
  for (const part of comparable.parts) {
    if (part.type === "reasoning") delete part.id;
  }
  return comparable;
};

const expectParity = (turn: Awaited<ReturnType<typeof runTurn>>) => {
  const reopened = turn.reopened.at(-1);
  expect(reopened?.role).toBe("assistant");
  expect(withoutLiveOnlyDetails(turn.live.message)).toEqual(reopened);
};

describe("a live response reduces to the message its history reopens as", () => {
  test("a text reply", async () => {
    harness.script([fauxAssistantMessage([fauxText("Hello there.")])]);
    const turn = await runTurn("Hi");
    expect(turn.live.streamErrors).toEqual([]);
    expectParity(turn);
  });

  test("a multi-step reply with a server tool and a data part", async () => {
    harness.script([
      fauxAssistantMessage(
        [
          fauxText("Let me check."),
          fauxToolCall(harnessTools.lookup, { q: "x" }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText("Found it.")]),
    ]);
    const turn = await runTurn("Look it up");
    expect(
      turn.live.message?.parts.filter((part) => part.type === "step-start"),
    ).toHaveLength(2);
    expectParity(turn);
  });

  test("reasoning before text", async () => {
    harness.script([
      fauxAssistantMessage([fauxThinking("Considering."), fauxText("Answer.")]),
    ]);
    expectParity(await runTurn("Think"));
  });

  test("a client tool whose result carries a host envelope", async () => {
    harness.script([
      fauxAssistantMessage(
        [fauxToolCall(harnessTools.widget, { title: "t" })],
        {
          stopReason: "toolUse",
        },
      ),
      fauxAssistantMessage([fauxText("Shown.")]),
    ]);
    const turn = await runTurn("Show it");
    expect(turn.live.message?.parts).toContainEqual(
      expect.objectContaining({
        type: `tool-${harnessTools.widget}`,
        output: { shown: "t" },
      }),
    );
    expectParity(turn);
  });

  test("a client tool the host renders dynamically", async () => {
    harness.script([
      fauxAssistantMessage(
        [fauxToolCall(harnessTools.widget, { title: "d" })],
        {
          stopReason: "toolUse",
        },
      ),
      fauxAssistantMessage([fauxText("Shown.")]),
    ]);
    const turn = await runTurn("Show it", {
      dynamicClientToolNames: new Set([harnessTools.widget]),
    });
    expect(turn.live.message?.parts).toContainEqual(
      expect.objectContaining({
        type: "dynamic-tool",
        toolName: harnessTools.widget,
      }),
    );
    expectParity(turn);
  });

  test("a failing server tool", async () => {
    harness.script([
      fauxAssistantMessage([fauxToolCall(harnessTools.failing, { q: "x" })], {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage([fauxText("It failed.")]),
    ]);
    const turn = await runTurn("Try it");
    expect(turn.live.message?.parts).toContainEqual(
      expect.objectContaining({ state: "output-error" }),
    );
    expectParity(turn);
  });

  test("agent-authored response metadata", async () => {
    harness.setResponseMetadata({ model: "faux", tier: 1 });
    harness.script([fauxAssistantMessage([fauxText("Tagged.")])]);
    const turn = await runTurn("Tag it");
    harness.setResponseMetadata(undefined);
    expect(turn.reopened.at(-1)?.metadata).toEqual({ model: "faux", tier: 1 });
    expectParity(turn);
  });
});
