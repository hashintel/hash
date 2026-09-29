/**
 * Cases from `packages/ai/src/ui/process-ui-message-stream.test.ts` in
 * vercel/ai at `ai@6.0.286` (38f42fce), each reproduced as a real Flue turn
 * through the transport and reduced by that version's own reducer.
 *
 * "guarantee" cases assert behaviour the AI SDK types or documents.
 * "observed" cases pin reducer behaviour the transport relies on but the AI
 * SDK does not promise; a failure there is a compatibility decision to make,
 * not necessarily a transport bug.
 */
import {
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { afterAll, describe, expect, test } from "vitest";

import { createFlueUiStream } from "../src/client";
import { reduceUiMessageChunks } from "./ai-sdk-oracle";
import { harnessTools, startFlueHarness } from "./flue-harness";

import type { UIMessageChunk } from "ai";

const harness = await startFlueHarness();
afterAll(() => harness.stop());

const partTypes = (parts: readonly { readonly type: string }[] | undefined) =>
  parts?.map((part) => part.type);

const chunkIndex = (
  chunks: readonly UIMessageChunk[],
  predicate: (chunk: UIMessageChunk) => boolean,
) => chunks.findIndex(predicate);

describe("upstream: 'server-side tool roundtrip'", () => {
  test("guarantee: a server tool and the reply that follows it form two steps", async () => {
    harness.script([
      fauxAssistantMessage(
        [fauxToolCall(harnessTools.lookup, { q: "London" })],
        {
          stopReason: "toolUse",
        },
      ),
      fauxAssistantMessage([fauxText("It is sunny.")]),
    ]);
    const { live } = await harness.runTurn("Weather?");

    expect(partTypes(live.message?.parts)).toEqual([
      "step-start",
      `tool-${harnessTools.lookup}`,
      "data-progress",
      "step-start",
      "text",
    ]);
    expect(live.message?.parts[1]).toMatchObject({
      state: "output-available",
      input: { q: "London" },
      output: { answer: "found London" },
    });
  });

  test("observed: the tool output arrives after its step closes, and the reducer finds the part in the earlier step", async () => {
    harness.script([
      fauxAssistantMessage([fauxToolCall(harnessTools.lookup, { q: "x" })], {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage([fauxText("Done.")]),
    ]);
    const { chunks } = await harness.runTurn("Look");

    expect(
      chunkIndex(chunks, (chunk) => chunk.type === "tool-output-available"),
    ).toBeGreaterThan(
      chunkIndex(chunks, (chunk) => chunk.type === "finish-step"),
    );
  });
});

describe("upstream: 'server-side tool roundtrip with output-error'", () => {
  test("guarantee: a failing server tool ends in output-error with its text", async () => {
    harness.script([
      fauxAssistantMessage([fauxToolCall(harnessTools.failing, { q: "x" })], {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage([fauxText("It failed.")]),
    ]);
    const { live } = await harness.runTurn("Try");

    const failed = live.message?.parts.find(
      (part) => part.type === `tool-${harnessTools.failing}`,
    );
    expect(failed).toMatchObject({ state: "output-error" });
    expect(failed && "errorText" in failed ? failed.errorText : "").toContain(
      "The lookup service is unavailable.",
    );
  });
});

describe("upstream: 'provider-executed static tools'", () => {
  test("decision: every Flue-executed tool is provider-executed", async () => {
    harness.script([
      fauxAssistantMessage([fauxToolCall(harnessTools.lookup, { q: "x" })], {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage([fauxText("Done.")]),
    ]);
    const { chunks, live } = await harness.runTurn("Look");

    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: "tool-input-available",
        providerExecuted: true,
      }),
    );
    expect(live.message?.parts[1]).toMatchObject({ providerExecuted: true });
  });

  test("observed: a client tool's input is not provider-executed, but its in-band result makes it so", async () => {
    harness.script([
      fauxAssistantMessage(
        [fauxToolCall(harnessTools.widget, { title: "t" })],
        {
          stopReason: "toolUse",
        },
      ),
      fauxAssistantMessage([fauxText("Shown.")]),
    ]);
    const { chunks, live } = await harness.runTurn("Show");

    const input = chunks.find((chunk) => chunk.type === "tool-input-available");
    expect(input).toMatchObject({ providerExecuted: undefined });
    expect(live.message?.parts[1]).toMatchObject({
      state: "output-available",
      providerExecuted: true,
    });
  });
});

describe("upstream: 'dynamic tools'", () => {
  test("guarantee: a host-defined tool reduces to a dynamic-tool part", async () => {
    harness.script([
      fauxAssistantMessage(
        [fauxToolCall(harnessTools.widget, { title: "d" })],
        {
          stopReason: "toolUse",
        },
      ),
      fauxAssistantMessage([fauxText("Shown.")]),
    ]);
    const { live } = await harness.runTurn("Show", {
      adapter: { dynamicClientToolNames: new Set([harnessTools.widget]) },
    });

    expect(live.message?.parts[1]).toMatchObject({
      type: "dynamic-tool",
      toolName: harnessTools.widget,
      state: "output-available",
      output: { shown: "d" },
    });
  });
});

describe("upstream: 'message metadata'", () => {
  test("guarantee: metadata on the start chunk becomes the message's metadata", async () => {
    harness.setResponseMetadata({ model: "faux" });
    harness.script([fauxAssistantMessage([fauxText("Tagged.")])]);
    const { chunks, live } = await harness.runTurn("Tag");
    harness.setResponseMetadata(undefined);

    expect(chunks[0]).toMatchObject({
      type: "start",
      messageMetadata: { model: "faux" },
    });
    expect(live.message?.metadata).toEqual({ model: "faux" });
  });
});

describe("upstream: 'reasoning'", () => {
  test("guarantee: reasoning and text become separate done parts in order", async () => {
    harness.script([
      fauxAssistantMessage([fauxThinking("Considering."), fauxText("Answer.")]),
    ]);
    const { live } = await harness.runTurn("Think");

    expect(live.message?.parts).toMatchObject([
      { type: "step-start" },
      { type: "reasoning", text: "Considering.", state: "done" },
      { type: "text", text: "Answer.", state: "done" },
    ]);
  });
});

describe("upstream: 'data ui parts (single part)'", () => {
  test("guarantee: each Flue data write appends one data part", async () => {
    harness.script([
      fauxAssistantMessage([fauxToolCall(harnessTools.lookup, { q: "p" })], {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage([fauxText("Done.")]),
    ]);
    const { live } = await harness.runTurn("Progress");

    expect(live.message?.parts).toContainEqual({
      type: "data-progress",
      data: { q: "p" },
    });
  });
});

describe("upstream: 'start with message id'", () => {
  test("decision: the assistant message takes Flue's response message id", async () => {
    harness.script([fauxAssistantMessage([fauxText("Hi.")])]);
    const { history, live } = await harness.runTurn("Hi");

    expect(live.message?.id).toBe(history.messages.at(-1)?.id);
  });
});

describe("upstream: 'errors'", () => {
  test("decision: a failed submission ends the stream with one error chunk", async () => {
    harness.script([
      fauxAssistantMessage([], {
        stopReason: "error",
        errorMessage: "The provider is unavailable.",
      }),
    ]);
    const { chunks, live } = await harness.runTurn("Fail");

    expect(chunks.at(-1)).toMatchObject({ type: "error" });
    expect(live.streamErrors).toHaveLength(1);
  });
});

describe("upstream: 'tool call streaming'", () => {
  test("guarantee: live input deltas stream a partial input before Flue admits the call", async () => {
    harness.script([
      fauxAssistantMessage(
        [fauxToolCall(harnessTools.lookup, { q: "streamed" })],
        {
          stopReason: "toolUse",
        },
      ),
      fauxAssistantMessage([fauxText("Done.")]),
    ]);
    const { chunks, live } = await harness.runTurn("Look", {
      transport: { liveToolStream: { headers: {}, fetch: harness.fetch } },
    });

    const types = chunks.map((chunk) => chunk.type);
    expect(types.indexOf("tool-input-start")).toBeGreaterThan(-1);
    expect(types.indexOf("tool-input-delta")).toBeGreaterThan(
      types.indexOf("tool-input-start"),
    );
    expect(types.indexOf("tool-input-available")).toBeGreaterThan(
      types.lastIndexOf("tool-input-delta"),
    );
    expect(
      live.snapshots.some((snapshot) =>
        snapshot.parts.some(
          (part) =>
            "state" in part &&
            part.state === "input-streaming" &&
            part.input !== undefined,
        ),
      ),
    ).toBe(true);
    expect(live.message?.parts[1]).toMatchObject({
      state: "output-available",
      input: { q: "streamed" },
    });
  });
});

describe("upstream: 'provider-executed static tools' (two calls in one step)", () => {
  test("guarantee: each call in a step settles its own part, one output and one error", async () => {
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
    const { live } = await harness.runTurn("Both");

    expect(live.message?.parts).toMatchObject([
      { type: "step-start" },
      { type: `tool-${harnessTools.lookup}`, state: "output-available" },
      { type: `tool-${harnessTools.failing}`, state: "output-error" },
      { type: "data-progress" },
      { type: "step-start" },
      { type: "text", text: "Both settled." },
    ]);
  });
});

describe("upstream: 'dynamic tools' (two calls in one step)", () => {
  test("guarantee: two host-defined calls in one step reduce to two dynamic parts", async () => {
    harness.script([
      fauxAssistantMessage(
        [
          fauxToolCall(harnessTools.widget, { title: "first" }),
          fauxToolCall(harnessTools.widget, { title: "second" }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText("Shown.")]),
    ]);
    const { live } = await harness.runTurn("Show both", {
      adapter: { dynamicClientToolNames: new Set([harnessTools.widget]) },
    });

    expect(
      live.message?.parts.filter((part) => part.type === "dynamic-tool"),
    ).toMatchObject([
      { toolName: harnessTools.widget, output: { shown: "first" } },
      { toolName: harnessTools.widget, output: { shown: "second" } },
    ]);
  });
});

describe("upstream: 'tool input error'", () => {
  // A live call Flue never admits cannot be produced generically: Flue keeps
  // a partial input even when the provider fails. The projector's own
  // cancellation is driven directly instead.
  test("observed: a live call cancelled before admission ends in output-error with no input", async () => {
    const written: UIMessageChunk[] = [];
    const projector = createFlueUiStream({
      submissionId: "submission-1",
      clientToolNames: new Set(),
      write: (chunk) => written.push(chunk),
    });
    projector.accept({
      type: "message-started",
      conversationId: "conversation-1",
      messageId: "message-1",
      submissionId: "submission-1",
      turnId: "turn-1",
      position: { batch: 1, index: 0 },
    });
    for (const [sequence, event] of [
      { kind: "tool-input-start" },
      { kind: "tool-input-delta", inputTextDelta: '{ "q": "partial' },
    ].entries()) {
      projector.acceptLive({
        instanceId: "instance-1",
        sequence,
        submissionId: "submission-1",
        turnId: "turn-1",
        toolCallId: "call-1",
        toolName: harnessTools.lookup,
        v: 1,
        ...event,
      } as Parameters<typeof projector.acceptLive>[0]);
    }
    projector.accept({
      type: "submission-settled",
      conversationId: "conversation-1",
      submissionId: "submission-1",
      outcome: "failed",
      position: { batch: 1, index: 1 },
    });
    const { message } = await reduceUiMessageChunks(written);

    expect(message?.parts).toMatchObject([
      { type: "step-start" },
      {
        type: `tool-${harnessTools.lookup}`,
        state: "output-error",
        input: undefined,
        errorText: "This tool proposal was not executed.",
      },
    ]);
  });
});
