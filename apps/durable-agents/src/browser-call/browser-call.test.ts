/**
 * What a browser-call record keeps for the net-state folds: the browser's
 * output and metadata, and the call's position, by tool call ID. And what the
 * model is sent when a call settles: a read with its `netRevision`, a change
 * with `netAfterChanges` and `netRevision`, anything else bare, while
 * `details` keep Brunch's envelope.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ConversationId,
  createRegistry,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { expect, test, vi } from "vitest";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../test/scripted-model";
import { createHostBinding } from "../agent/host-binding";
import {
  bindBrowserDocument,
  browserCallExtension,
  type BrowserCallResult,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
} from "./browser-call";
import { createPetrinautBrowserToolsExtension } from "./petrinaut-browser-tools";

import type { Message } from "@earendil-works/pi-ai";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

const context = BACKGROUND_CONTEXT;

test("a record keeps the browser's output and metadata, its issuing entry, and its place in the round", async () => {
  const { models, model } = scriptedModel([
    fauxAssistantMessage(
      [
        fauxToolCall("readNetOutline", {}, { id: "outline" }),
        fauxToolCall("readNetStructure", {}, { id: "structure" }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("Read it twice."),
  ]);
  const host = createHostBinding();
  const petrinautBrowserToolsExtension =
    createPetrinautBrowserToolsExtension(host);
  const registry = createRegistry();
  registry.install(browserCallExtension);
  registry.install(petrinautBrowserToolsExtension);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  host.bind(harness);
  const root = await harness.root(context, {
    agent: { model, extensions: [petrinautBrowserToolsExtension] },
  });
  await harness.commit(
    (tx) =>
      bindBrowserDocument(tx, root.id, {
        conversationId: "conversation-1",
        documentId: "net-1",
      }),
    context,
  );
  const submission = await root.submit(
    { type: "input", content: "What is in the net?" },
    context,
  );
  const outputs = {
    outline: { title: "Outline" },
    structure: { title: "Structure" },
  };
  // Answered out of call order.
  for (const toolCallId of ["structure", "outline"] as const) {
    // eslint-disable-next-line no-await-in-loop -- One call at a time.
    await vi.waitFor(async () => {
      const calls = (await harness.snapshot(BrowserCallsDoc, root.id, context))
        ?.calls;
      expect(calls?.[toolCallId]?.status).toBe("pending");
    });
    // eslint-disable-next-line no-await-in-loop
    const claim = await claimBrowserCall(harness, root.id, toolCallId, context);
    // eslint-disable-next-line no-await-in-loop
    await finishBrowserCall(
      harness,
      {
        conversationId: root.id,
        toolCallId,
        toolName: claim!.toolName,
        capability: claim!.capability,
        canonicalInput: claim!.input,
        output: outputs[toolCallId],
        metadata: { documentRevision: { before: `revision-${toolCallId}` } },
      },
      context,
    );
  }
  expect((await submission.wait(context)).status).toBe("done");

  const { entries, messages } = await root.context(context);
  const assistant = entries.find(({ kind }) => kind === "pi.assistant");
  const calls = (await harness.snapshot(BrowserCallsDoc, root.id, context))
    ?.calls;
  expect(calls?.outline).toMatchObject({
    status: "settled",
    output: outputs.outline,
    metadata: { documentRevision: { before: "revision-outline" } },
    issuedEntry: assistant?.id,
    callIndex: 0,
  });
  expect(calls?.structure).toMatchObject({
    status: "settled",
    output: outputs.structure,
    issuedEntry: assistant?.id,
    callIndex: 1,
  });
  // The model sees each result after its assistant message at the call's index, whatever order they settled in.
  const issuing = messages.findIndex(
    (message) =>
      message.role === "assistant" &&
      message.content.some((content) => content.type === "toolCall"),
  );
  expect(
    messages
      .slice(issuing + 1, issuing + 3)
      .map((message) =>
        message.role === "toolResult" ? message.toolCallId : message.role,
      ),
  ).toEqual(["outline", "structure"]);
  await harness.close(context);
});

/** The browser's side: claim the issued call and finish it. */
const answer = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  output: BrowserCallResult["output"],
  metadata?: BrowserCallResult["metadata"],
) => {
  await vi.waitFor(async () => {
    const calls = (
      await harness.snapshot(BrowserCallsDoc, conversationId, context)
    )?.calls;
    expect(calls?.[toolCallId]?.status).toBe("pending");
  });
  const claim = await claimBrowserCall(
    harness,
    conversationId,
    toolCallId,
    context,
  );
  if (claim === undefined) throw new Error(`${toolCallId} was not claimable.`);
  await finishBrowserCall(
    harness,
    {
      conversationId,
      toolCallId,
      toolName: claim.toolName,
      capability: claim.capability,
      canonicalInput: claim.input,
      output,
      metadata,
    },
    context,
  );
};

test("a settled result reaches the model rendered: a read with netRevision, a change with netAfterChanges and netRevision, anything else bare; details keep Brunch's envelope", async () => {
  const requests: Message[][] = [];
  const recorded =
    (step: FauxResponseStep): FauxResponseStep =>
    (request, ...rest) => {
      requests.push(structuredClone(request.messages));
      return typeof step === "function" ? step(request, ...rest) : step;
    };
  const place = {
    id: "place-dryer",
    name: "Dryer",
    colorId: null,
    dynamicsEnabled: false,
    x: 0,
    y: 0,
  };
  const { models, model } = scriptedModel(
    [
      fauxAssistantMessage(fauxToolCall("readNetOutline", {}, { id: "read" }), {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage(
        [
          fauxToolCall("addPlace", place, { id: "change" }),
          fauxToolCall("getNetCompilationErrors", {}, { id: "doc" }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Added the dryer."),
    ].map(recorded),
  );
  const host = createHostBinding();
  const tools = createPetrinautBrowserToolsExtension(host);
  const registry = createRegistry();
  registry.install(browserCallExtension);
  registry.install(tools);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  host.bind(harness);
  try {
    const root = await harness.root(context, {
      agent: { model, extensions: [tools] },
    });
    await harness.commit(
      (tx) =>
        bindBrowserDocument(tx, root.id, {
          conversationId: "conversation-1",
          documentId: "net-1",
        }),
      context,
    );
    const submission = await root.submit(
      { type: "input", content: "Add a dryer." },
      context,
    );
    const readOutput = { title: "Net" };
    const readBack = { places: [{ id: "place-dryer" }] };
    const changeMetadata = {
      documentRevision: { before: "R1", after: "R2" },
      readBack,
    };
    await answer(harness, root.id, "read", readOutput, {
      documentRevision: { before: "R1" },
    });
    await answer(harness, root.id, "change", { applied: true }, changeMetadata);
    // A JSON-looking string stays a string.
    await answer(harness, root.id, "doc", "123", {
      documentRevision: { before: "R2" },
    });
    expect((await submission.wait(context)).status).toBe("done");

    const texts = Object.fromEntries(
      (requests.at(-1) ?? []).flatMap((message) =>
        message.role === "toolResult"
          ? [
              [
                message.toolCallId,
                message.content.flatMap((part) =>
                  part.type === "text" ? [part.text] : [],
                ),
              ],
            ]
          : [],
      ),
    );
    expect(texts).toEqual({
      read: [JSON.stringify({ output: readOutput, netRevision: "R1" })],
      change: [
        JSON.stringify({
          output: { applied: true },
          netAfterChanges: readBack,
          netRevision: "R2",
        }),
      ],
      doc: [JSON.stringify("123")],
    });
    const { messages } = await root.context(context);
    const changeResult = messages.find(
      (message) =>
        message.role === "toolResult" && message.toolCallId === "change",
    );
    expect(changeResult?.role === "toolResult" && changeResult.details).toEqual(
      {
        brunchBrowserResult: true,
        output: { applied: true },
        metadata: changeMetadata,
      },
    );
    // The change was issued against the read the model was sent.
    expect(
      (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls.change
        ?.expectedRevision,
    ).toBe("R1");
  } finally {
    await harness.close(context);
  }
});
