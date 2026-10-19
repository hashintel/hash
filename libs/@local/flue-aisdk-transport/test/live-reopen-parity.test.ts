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

/**
 * A model attempt that fails with an error Flue classifies as transient, so
 * Flue retries it within the same response. Once the replacement starts,
 * history omits this attempt's content, and Flue folds the start of each
 * later step of the response into a `conversation-reset`.
 */
const retriedAttempt = (
  content: Parameters<typeof fauxAssistantMessage>[0],
): ReturnType<typeof fauxAssistantMessage> =>
  fauxAssistantMessage(content, {
    stopReason: "error",
    errorMessage: "503 Service Unavailable",
  });

const stepStarts = (turn: Awaited<ReturnType<typeof runTurn>>) =>
  turn.live.message?.parts.filter((part) => part.type === "step-start");

test("a text reply reopens as the message it streamed as", async () => {
  harness.script([fauxAssistantMessage([fauxText("Hello there.")])]);
  const turn = await runTurn("Hi");
  expect(turn.live.streamErrors).toEqual([]);
  expectLiveReopenParity(turn);
});

// The AI SDK reducer only appends parts, so the raw stream cannot withdraw
// what a retried attempt already streamed. Parity is restored by the host
// following history at settlement; the Petrinaut panel's reconciliation is
// proven in `tests/petrinaut-brunch-integration`.
test("observed: a model attempt Flue retried stays in the raw live stream but not in reopened history", async () => {
  harness.script([
    retriedAttempt([fauxText("Partial")]),
    fauxAssistantMessage([fauxText("Complete.")]),
  ]);
  const turn = await runTurn("Hi");

  expect(turn.live.streamErrors).toEqual([]);
  expect(stepStarts(turn)).toHaveLength(2);
  const live = withoutLiveOnlyDetails(turn.live.message);
  expect(live?.parts).toEqual([
    { type: "text", text: "Partial", state: "done" },
    { type: "text", text: "Complete.", state: "done" },
  ]);
  expect(turn.reopened.at(-1)).toEqual({
    ...live,
    parts: live?.parts.slice(1),
  });
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

  test("live tool input still streams in each step after a model attempt Flue retried", async () => {
    harness.script([
      retriedAttempt([
        fauxToolCall(
          harnessTools.widget,
          { title: "superseded" },
          { id: "superseded-call" },
        ),
      ]),
      fauxAssistantMessage(
        [
          fauxToolCall(
            harnessTools.widget,
            { title: "replacement" },
            { id: "replacement-call" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(
        [
          fauxToolCall(
            harnessTools.widget,
            { title: "later" },
            { id: "later-call" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText("Shown.")]),
    ]);
    const turn = await runTurn("Show it", { transport });

    expect(turn.live.streamErrors).toEqual([]);
    for (const toolCallId of ["replacement-call", "later-call"]) {
      const inputStart = turn.chunks.findIndex(
        (chunk) =>
          chunk.type === "tool-input-start" && chunk.toolCallId === toolCallId,
      );
      const inputAvailable = turn.chunks.findIndex(
        (chunk) =>
          chunk.type === "tool-input-available" &&
          chunk.toolCallId === toolCallId,
      );
      expect(inputStart).toBeGreaterThan(-1);
      expect(inputAvailable).toBeGreaterThan(inputStart);
    }
    expect(stepStarts(turn)).toHaveLength(4);
    // The superseded attempt's part is the raw-stream limitation pinned above.
    const live = withoutLiveOnlyDetails(turn.live.message);
    expect(turn.reopened.at(-1)).toEqual({
      ...live,
      parts: live?.parts.filter(
        (part) =>
          !("toolCallId" in part) || part.toolCallId !== "superseded-call",
      ),
    });
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
