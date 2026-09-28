import { fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import * as v from "valibot";
import { afterAll, expect, test } from "vitest";

import { createFlueAiSdkAdapter } from "../client";
import { harnessAdapterConfig, startFlueHarness } from "./flue-harness";

import type { UIMessage } from "ai";

const harness = await startFlueHarness();
afterAll(() => harness.stop());

type TaggedMessage = UIMessage<{ model: string }>;
const taggedMetadataSchema = v.object({ model: v.string() });

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

test("metadata that fails the schema ends the live turn with an error, and reopening throws", async () => {
  harness.setResponseMetadata({ model: 1 });
  harness.script([
    fauxAssistantMessage([fauxText("Mistagged.")]),
    fauxAssistantMessage([fauxText("Mistagged again.")]),
  ]);
  const turn = await harness.runTurn("Tag");
  const strict = createFlueAiSdkAdapter<TaggedMessage>({
    ...harnessAdapterConfig,
    metadataSchema: taggedMetadataSchema,
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

  expect(() => strict.reopen(turn.history)).toThrow(
    "Message metadata does not match the host schema",
  );
  expect(chunks.at(-1)).toMatchObject({
    type: "error",
    errorText: expect.stringContaining(
      "Message metadata does not match the host schema",
    ) as unknown,
  });
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
