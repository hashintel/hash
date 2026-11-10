/**
 * What a browser-call record keeps for the net-state folds: the browser's
 * output and metadata, and the call's position, by tool call ID.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
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
import {
  bindBrowserDocument,
  browserCallExtension,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
} from "./browser-call";
import { petrinautBrowserToolsExtension } from "./petrinaut-browser-tools";

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
  const registry = createRegistry();
  registry.install(browserCallExtension);
  registry.install(petrinautBrowserToolsExtension);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
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
