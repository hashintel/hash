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
  test("decision: every Flue-executed tool is provider-executed, so the client never runs or continues it", async () => {
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
    expect(input).not.toHaveProperty("providerExecuted");
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
      dynamicClientToolNames: new Set([harnessTools.widget]),
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
  test("guarantee: the assistant message takes Flue's response message id", async () => {
    harness.script([fauxAssistantMessage([fauxText("Hi.")])]);
    const { history, live } = await harness.runTurn("Hi");

    expect(live.message?.id).toBe(history.messages.at(-1)?.id);
  });
});

describe("upstream: 'errors'", () => {
  test("guarantee: a failed submission ends the stream with one error chunk", async () => {
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
      liveToolStream: { headers: {}, fetch: harness.fetch },
    });

    const types = chunks.map((chunk) => chunk.type);
    expect(types.indexOf("tool-input-start")).toBeGreaterThan(-1);
    expect(types.indexOf("tool-input-delta")).toBeGreaterThan(
      types.indexOf("tool-input-start"),
    );
    expect(types.indexOf("tool-input-available")).toBeGreaterThan(
      types.lastIndexOf("tool-input-delta"),
    );
    expect(live.message?.parts[1]).toMatchObject({
      state: "output-available",
      input: { q: "streamed" },
    });
  });
});
