/**
 * The transport's own contract: a reduced live response equals the message
 * its stored history reopens as. Every real Flue turn in
 * `upstream-reducer-cases.test.ts` asserts this too; the cases here cover
 * shapes no upstream case produces. Cases that pin a README decision say so.
 */
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { afterAll, describe, expect, test, vi } from "vitest";

import {
  expectLiveReopenParity,
  harnessTools,
  startFlueHarness,
  withoutLiveOnlyDetails,
} from "./flue-harness";

const harness = await startFlueHarness();
afterAll(() => harness.stop());

const { runTurn } = harness;

test("a text reply reopens as the message it streamed as", async () => {
  harness.script([fauxAssistantMessage([fauxText("Hello there.")])]);
  const turn = await runTurn("Hi");
  expect(turn.live.streamErrors).toEqual([]);
  expectLiveReopenParity(turn);
});

describe("with the live tool-input channel", () => {
  const transport = { liveToolStream: { headers: {}, fetch: harness.fetch } };

  test("a client tool alone in its step reopens as it streamed", async () => {
    harness.script([
      fauxAssistantMessage(
        [fauxToolCall(harnessTools.widget, { title: "t" })],
        {
          stopReason: "toolUse",
        },
      ),
      fauxAssistantMessage([fauxText("Shown.")]),
    ]);
    expectLiveReopenParity(await runTurn("Show it", { transport }));
  });

  // The live channel can open the tool part before Flue delivers the text that
  // precedes it, and the AI SDK reducer cannot reorder parts, so only the set
  // of parts is stable; ui-stream.test.ts pins the ordering divergence.
  test("open decision: text before a tool call in one step keeps every part, not their order", async () => {
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

  // The live channel is not reopened on a re-attach; later tool inputs arrive
  // through the update stream instead.
  test("decision: a re-attach after a live client tool reopens as it streamed", async () => {
    const { client, cut, refused } = harness.cuttableClient();
    harness.script([
      fauxAssistantMessage(
        [fauxToolCall(harnessTools.widget, { title: "before" })],
        { stopReason: "toolUse" },
      ),
      () => {
        cut(410, 1);
        return fauxAssistantMessage(
          [fauxToolCall(harnessTools.widget, { title: "after" })],
          { stopReason: "toolUse" },
        );
      },
      fauxAssistantMessage([fauxText("Shown.")]),
    ]);
    const turn = await runTurn("Show both", { client, transport });

    expect(refused()).toBe(1);
    expect(turn.live.streamErrors).toEqual([]);
    expectLiveReopenParity(turn);
  });
});

test("decision: an aborted response ends with an abort chunk and carries the host's abort marker, live and after reopen", async () => {
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
  expectLiveReopenParity(turn);
});
