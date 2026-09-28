import {
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { afterAll, describe, expect, test, vi } from "vitest";

import { harnessTools, startFlueHarness } from "./flue-harness";

import type { UIMessage } from "ai";

const harness = await startFlueHarness();
afterAll(() => harness.stop());

const { runTurn } = harness;

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

const expectParity = (turn: Awaited<ReturnType<typeof harness.runTurn>>) => {
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
    expectParity(await runTurn("Look it up"));
  });

  test("two tool calls in one step", async () => {
    harness.script([
      fauxAssistantMessage(
        [
          fauxToolCall(harnessTools.lookup, { q: "a" }),
          fauxToolCall(harnessTools.failing, { q: "b" }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText("Both settled.")]),
    ]);
    expectParity(await runTurn("Both"));
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
    expectParity(
      await runTurn("Show it", {
        adapter: { dynamicClientToolNames: new Set([harnessTools.widget]) },
      }),
    );
  });

  test("a failing server tool", async () => {
    harness.script([
      fauxAssistantMessage([fauxToolCall(harnessTools.failing, { q: "x" })], {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage([fauxText("It failed.")]),
    ]);
    expectParity(await runTurn("Try it"));
  });

  test("agent-authored response metadata", async () => {
    harness.setResponseMetadata({ model: "faux", tier: 1 });
    harness.script([fauxAssistantMessage([fauxText("Tagged.")])]);
    const turn = await runTurn("Tag it");
    harness.setResponseMetadata(undefined);
    expectParity(turn);
  });
});

describe("with the live tool-input channel", () => {
  const transport = { liveToolStream: { headers: {}, fetch: harness.fetch } };

  test("a tool-only step keeps parity", async () => {
    harness.script([
      fauxAssistantMessage(
        [fauxToolCall(harnessTools.widget, { title: "t" })],
        {
          stopReason: "toolUse",
        },
      ),
      fauxAssistantMessage([fauxText("Shown.")]),
    ]);
    expectParity(await runTurn("Show it", { transport }));
  });

  // The live channel can open the tool part before Flue delivers the text that
  // precedes it, and the AI SDK reducer cannot reorder parts, so only the set
  // of parts is stable; ui-stream.test.ts pins the ordering divergence.
  test("text before a tool call in one step keeps every part", async () => {
    harness.script([
      fauxAssistantMessage(
        [
          fauxText("Showing it now."),
          fauxToolCall(harnessTools.widget, { title: "t" }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText("Shown.")]),
    ]);
    const turn = await runTurn("Show it", { transport });
    const liveParts = withoutLiveOnlyDetails(turn.live.message)?.parts;
    const reopenedParts = turn.reopened.at(-1)?.parts ?? [];
    expect(liveParts).toHaveLength(reopenedParts.length);
    expect(liveParts).toEqual(expect.arrayContaining(reopenedParts));
  });
});

describe("host-derived metadata", () => {
  test("an aborted response carries the host's abort marker live and after reopen", async () => {
    const release = Promise.withResolvers<void>();
    harness.script([
      fauxAssistantMessage(
        [fauxText("Started."), fauxToolCall(harnessTools.lookup, { q: "x" })],
        { stopReason: "toolUse" },
      ),
      async () => {
        await release.promise;
        return fauxAssistantMessage([fauxText("Too late.")]);
      },
    ]);
    const turn = await runTurn("Slow", {
      duringTurn: async (conversation) => {
        await vi.waitFor(async () => {
          const { messages } = await conversation.history();
          expect(messages.at(-1)?.role).toBe("assistant");
        });
        await conversation.abort();
        release.resolve();
      },
    });

    expect(turn.chunks.at(-1)).toMatchObject({ type: "abort" });
    expect(turn.live.message?.metadata).toEqual({ aborted: true });
    expectParity(turn);
  });
});
