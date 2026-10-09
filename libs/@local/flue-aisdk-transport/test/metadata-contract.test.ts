/**
 * The metadata half of the README's host contract, which is this package's
 * decision rather than AI SDK behaviour: a narrowed metadata type requires its
 * schema, and the schema validates synchronously, live and on reopen.
 */
import { fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import * as v from "valibot";
import { afterAll, expect, test } from "vitest";

import { createFlueAiSdkAdapter } from "../src/client";
import {
  expectLiveReopenParity,
  harnessAdapterConfig,
  startFlueHarness,
} from "./flue-harness";
import { useRaisedErrors } from "./raised-errors";

import type { InvalidReopenedMetadata } from "../src/client";
import type { UIMessage, UIMessageChunk } from "ai";

const harness = await startFlueHarness();
afterAll(() => harness.stop());

type TaggedMessage = UIMessage<{ model: string }>;
const taggedMetadataSchema = v.object({ model: v.string() });
const captureRaisedErrors = useRaisedErrors();

test("a host with its own metadata type must supply the schema that owns it", () => {
  // @ts-expect-error A narrowed metadata type needs its schema.
  createFlueAiSdkAdapter<TaggedMessage>({ clientToolNames: new Set() });
  const adapter = createFlueAiSdkAdapter<TaggedMessage>({
    clientToolNames: new Set(),
    metadataSchema: taggedMetadataSchema,
  });
  expect(adapter.reopen({ messages: [] })).toEqual([]);
});

test("schema-valid agent metadata reaches the message as the host type", async () => {
  harness.setResponseMetadata({ model: "faux" });
  harness.script([fauxAssistantMessage([fauxText("Tagged.")])]);
  const turn = await harness.runTurn("Tag", {
    adapter: { metadataSchema: taggedMetadataSchema },
  });
  harness.setResponseMetadata(undefined);

  expect(turn.live.message?.metadata).toEqual({ model: "faux" });
  expect(turn.reopened.at(-1)?.metadata).toEqual({ model: "faux" });
});

test("start and finish metadata merge live as Flue merges them into history", async () => {
  harness.setResponseMetadata({
    model: "faux",
    usage: { input: 3, cache: { read: 1 } },
    tags: ["drafted"],
  });
  harness.setResponseFinishMetadata({
    usage: { output: 5, cache: { write: 2 } },
    tags: ["settled"],
    finishedAt: 7,
  });
  harness.script([fauxAssistantMessage([fauxText("Merged.")])]);
  const turn = await harness.runTurn("Merge", {
    adapter: {
      // The AI SDK deep-merges metadata objects, which would mask this
      // package's merge; it replaces arrays, so the live message carries the
      // transport's merged metadata as projected.
      projectMetadata: ({ agentMetadata }) =>
        agentMetadata === undefined ? undefined : { merged: [agentMetadata] },
    },
  });
  harness.setResponseMetadata(undefined);
  harness.setResponseFinishMetadata(undefined);

  expect(turn.reopened.at(-1)?.metadata).toEqual({
    merged: [
      {
        model: "faux",
        usage: { input: 3, output: 5, cache: { read: 1, write: 2 } },
        tags: ["settled"],
        finishedAt: 7,
      },
    ],
  });
  expectLiveReopenParity(turn);
});

test("metadata that fails the schema ends the live turn with an error, and reopening drops it and reports it once, after reopen returns", async () => {
  harness.setResponseMetadata({ model: 1 });
  harness.script([
    fauxAssistantMessage([fauxText("Mistagged.")]),
    fauxAssistantMessage([fauxText("Mistagged again.")]),
  ]);
  const turn = await harness.runTurn("Tag");
  const reported: InvalidReopenedMetadata[] = [];
  const strict = createFlueAiSdkAdapter<TaggedMessage>({
    ...harnessAdapterConfig,
    metadataSchema: taggedMetadataSchema,
    onInvalidReopenedMetadata: (invalid) => reported.push(invalid),
  });
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of await strict
    .chatTransport({ client: harness.client() })
    .sendMessages({
      trigger: "submit-message",
      chatId: "conversation",
      messageId: undefined,
      messages: [
        { id: "user-1", role: "user", parts: [{ type: "text", text: "Tag" }] },
      ],
      abortSignal: undefined,
    })) {
    chunks.push(chunk);
  }
  harness.setResponseMetadata(undefined);

  strict.reopen(turn.history);
  const reopened = strict.reopen(turn.history);
  expect(reported).toEqual([]);
  await Promise.resolve();
  const mistagged = reopened.at(-1);
  expect(mistagged).toMatchObject({
    role: "assistant",
    parts: [{ type: "text", text: "Mistagged." }],
  });
  expect(mistagged?.metadata).toBeUndefined();
  expect(reported).toEqual([
    {
      messageId: mistagged?.id,
      error: expect.objectContaining({
        message: expect.stringContaining(
          "Message metadata does not match the host schema",
        ) as unknown,
      }) as unknown,
    },
  ]);
  expect(chunks.at(-1)).toMatchObject({
    type: "error",
    errorText: expect.stringContaining(
      "Message metadata does not match the host schema",
    ) as unknown,
  });
});

test("a reporter that throws cannot make reopening fail", () => {
  const raised = captureRaisedErrors();
  const reporterFailure = new Error("Reporter failure.");
  const adapter = createFlueAiSdkAdapter<TaggedMessage>({
    clientToolNames: new Set(),
    metadataSchema: taggedMetadataSchema,
    onInvalidReopenedMetadata: () => {
      throw reporterFailure;
    },
  });

  const reopened = adapter.reopen({
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        metadata: { model: 1 },
        parts: [{ type: "text", text: "Hi", state: "done" }],
      },
    ],
  });

  expect(reopened).toMatchObject([
    { id: "assistant-1", parts: [{ type: "text", text: "Hi" }] },
  ]);
  expect(reopened.at(0)?.metadata).toBeUndefined();
  expect(raised).toEqual([reporterFailure]);
});

test("an asynchronous schema is refused rather than skipped", () => {
  const asyncSchema = v.pipeAsync(
    v.object({ model: v.string() }),
    v.checkAsync(async () => true),
  );
  const adapter = createFlueAiSdkAdapter<TaggedMessage>({
    clientToolNames: new Set(),
    metadataSchema: asyncSchema,
  });

  expect(() =>
    adapter.reopen({
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          purpose: "assistant",
          display: "visible",
          metadata: { model: "m" },
          parts: [{ type: "text", text: "Hi", state: "done" }],
        },
      ],
    }),
  ).toThrow("must validate synchronously");
});
