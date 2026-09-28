import {
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { afterAll, describe, expect, test } from "vitest";

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

describe("with the live tool-input channel", () => {
  const liveToolStream = { headers: {}, fetch: harness.fetch };

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
    expectParity(await runTurn("Show it", { liveToolStream }));
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
    const turn = await runTurn("Show it", { liveToolStream });
    const liveParts = withoutLiveOnlyDetails(turn.live.message)?.parts;
    const reopenedParts = turn.reopened.at(-1)?.parts ?? [];
    expect(liveParts).toHaveLength(reopenedParts.length);
    expect(liveParts).toEqual(expect.arrayContaining(reopenedParts));
  });
});
