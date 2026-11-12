/**
 * The UI's tool output from the projector: a browser tool's real output,
 * from Brunch's branded envelope in `details`, exactly as stored, whatever
 * the model was sent (a read with its `netRevision`, a change with its
 * read-back). Failures and other tools keep the text path. Fold 2a, proof
 * obligation 17.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ConversationId,
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { expect, test, vi } from "vitest";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../../../test/scripted-model";
import { createHostBinding } from "../../../agent/host-binding";
import {
  bindBrowserDocument,
  browserCallExtension,
  type BrowserCallResult,
  BrowserCallsDoc,
  claimBrowserCall,
  failBrowserCall,
  finishBrowserCall,
} from "../../../browser-call/browser-call";
import {
  createPetrinautBrowserToolsExtension,
  petrinautBrowserTools,
} from "../../../browser-call/petrinaut-browser-tools";
import { createViewProjector } from "./view-projector";

import type { UIMessageChunk } from "ai";

const context = BACKGROUND_CONTEXT;

const place = {
  id: "place-dryer",
  name: "Dryer",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};

/** The browser's side: claim the issued call and finish or fail it. */
const answer = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  result:
    | Pick<BrowserCallResult, "output" | "metadata">
    | { readonly fail: true },
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
  const proof = {
    conversationId,
    toolCallId,
    toolName: claim.toolName,
    capability: claim.capability,
    canonicalInput: claim.input,
  };
  if ("fail" in result)
    await failBrowserCall(
      harness,
      { ...proof, disposition: "failed" },
      context,
    );
  else await finishBrowserCall(harness, { ...proof, ...result }, context);
};

const serverTools = defineExtension({
  name: "test.server-tools",
  tools: [
    defineTool({
      name: "server_json",
      description: "Answers JSON text.",
      parameters: obj({}),
      execute: async () => ({ output: [{ type: "text", text: '{"a":1}' }] }),
    }),
    defineTool({
      name: "server_text",
      description: "Answers plain text.",
      parameters: obj({}),
      execute: async () => ({ output: [{ type: "text", text: "plain" }] }),
    }),
  ],
});

test("the projector's tool output is the browser's real output from details, for reads, changes, JSON-looking strings and failures; other tools keep the text path", async () => {
  const { models, model } = scriptedModel([
    fauxAssistantMessage(
      [
        fauxToolCall("readNetOutline", {}, { id: "read" }),
        fauxToolCall("server_json", {}, { id: "json" }),
        fauxToolCall("server_text", {}, { id: "text" }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall("addPlace", place, { id: "change" }),
        fauxToolCall("getNetCompilationErrors", {}, { id: "plain" }),
        fauxToolCall("addPlace", { ...place, id: "place-2" }, { id: "fail" }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("Done."),
  ]);
  const host = createHostBinding();
  const tools = createPetrinautBrowserToolsExtension(host);
  const registry = createRegistry();
  registry.install(browserCallExtension);
  registry.install(tools);
  registry.install(serverTools);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  host.bind(harness);
  try {
    const root = await harness.root(context, {
      agent: { model, extensions: [tools, serverTools] },
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
    const changeOutput = { applied: true };
    await answer(harness, root.id, "read", {
      output: readOutput,
      metadata: { documentRevision: { before: "R1" } },
    });
    await answer(harness, root.id, "change", {
      output: changeOutput,
      metadata: {
        documentRevision: { before: "R1", after: "R2" },
        readBack: { places: [{ id: place.id }] },
      },
    });
    await answer(harness, root.id, "plain", {
      output: "123",
      metadata: { documentRevision: { before: "R2" } },
    });
    await answer(harness, root.id, "fail", { fail: true });
    expect((await submission.wait(context)).status).toBe("done");

    const record = await submission.status(context);
    const watch = await root.watch(
      context,
      record.type === "input" && record.entry !== undefined
        ? { from: record.entry }
        : undefined,
    );
    const chunks: UIMessageChunk[] = [];
    const projector = createViewProjector(
      {
        clientToolNames: new Set(petrinautBrowserTools.map(({ name }) => name)),
      },
      (chunk) => chunks.push(chunk),
    );
    projector.accept({ submission: record, view: watch.value });
    await watch.stop();
    expect(projector.isFinished()).toBe(true);

    const outputs = Object.fromEntries(
      chunks.flatMap((chunk): [string, unknown][] => {
        if (chunk.type === "tool-output-available")
          return [[chunk.toolCallId, { output: chunk.output }]];
        if (chunk.type === "tool-output-error")
          return [[chunk.toolCallId, { errorText: chunk.errorText }]];
        return [];
      }),
    );
    expect(outputs).toEqual({
      // Browser tools: the output as stored, not the model's rendering.
      read: { output: readOutput },
      change: { output: changeOutput },
      // A JSON-looking string stays a string.
      plain: { output: "123" },
      fail: {
        errorText:
          "The browser result failed; an attempted document effect is unknown.",
      },
      // Other tools: today's text path.
      json: { output: { a: 1 } },
      text: { output: "plain" },
    });
  } finally {
    await harness.close(context);
  }
});
