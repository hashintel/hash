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
  type ConversationView,
  createRegistry,
  defineExtension,
  defineTool,
  type EntryId,
  type EntryRecord,
  Harness,
  MemoryStorage,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { expect, test, vi } from "vitest";

import { hashProcessEditorId } from "@hashintel/brunch-agent";

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
  createHashBrowserToolsExtension,
  hashBrowserToolDefinitions,
} from "../../../browser-call/hash-browser-tools";
import { createViewProjector, projectResponseEntries } from "./view-projector";

import type { UIMessageChunk } from "ai";

const context = BACKGROUND_CONTEXT;

const editor = { editor_id: hashProcessEditorId };

const place = {
  ...editor,
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
        fauxToolCall(
          "petrinaut_get_net",
          { ...editor, detail: "outline" },
          { id: "read" },
        ),
        fauxToolCall("server_json", {}, { id: "json" }),
        fauxToolCall("server_text", {}, { id: "text" }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall("petrinaut_create_place", place, { id: "change" }),
        fauxToolCall("petrinaut_get_diagnostics", editor, { id: "plain" }),
        fauxToolCall(
          "petrinaut_create_place",
          { ...place, id: "place-2" },
          { id: "fail" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("Done."),
  ]);
  const host = createHostBinding();
  const tools = createHashBrowserToolsExtension(host);
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
        clientToolNames: new Set(
          hashBrowserToolDefinitions().map(({ name }) => name),
        ),
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

// ─── The response's ID and its hand-edit notes ───────────────────────────────

const conversationId = 1 as ConversationId;
const entryId = (id: number) => id as EntryId;

const entry = (
  id: number,
  fields: Omit<EntryRecord, "id" | "conversationId">,
) => ({ id: entryId(id), conversationId, ...fields }) satisfies EntryRecord;

const input = (id: number) =>
  entry(id, {
    kind: "brunch.user",
    data: { body: "ordinary", userText: "Add a dryer." },
    model: [{ role: "user", content: "Add a dryer.", timestamp: 0 }],
  });

const note = (id: number, revision: string) =>
  entry(id, {
    kind: "brunch.hand-edit",
    data: { episode: "e", reportId: `e:${id}`, revision },
    model: [{ role: "user", content: "<hand-edit/>", timestamp: 0 }],
  });

const assistant = (
  id: number,
  message: ReturnType<typeof fauxAssistantMessage>,
) => entry(id, { kind: "pi.assistant", model: [message] });

const toolResult = (id: number) =>
  entry(id, {
    kind: "pi.tool-result",
    data: { diagnostics: [] },
    model: [
      {
        role: "toolResult",
        toolCallId: "json",
        toolName: "server_json",
        content: [{ type: "text", text: '{"a":1}' }],
        isError: false,
        timestamp: 0,
      },
    ],
  });

/** The chunks the live projector writes for a done submission over `entries`, in one view. */
const liveChunks = (entries: readonly EntryRecord[], answer: number) => {
  const chunks: UIMessageChunk[] = [];
  const projector = createViewProjector(
    { clientToolNames: new Set() },
    (chunk) => chunks.push(chunk),
  );
  projector.accept({
    submission: {
      id: 7 as SubmissionId,
      conversationId,
      type: "input",
      status: "done",
      entry: entryId(1),
      answer: entryId(answer),
    },
    view: { conversation: { id: conversationId }, entries, docs: {} },
  } satisfies { view: ConversationView } & Parameters<
    ReturnType<typeof createViewProjector>["accept"]
  >[0]);
  expect(projector.isFinished()).toBe(true);
  return chunks;
};

test("the response is named by its input entry; a note inside it is a data part before the next output, and notes before its first output or after its last are not part of it", () => {
  const entries = [
    input(1),
    note(2, "R0"),
    assistant(
      3,
      fauxAssistantMessage(fauxToolCall("server_json", {}, { id: "json" }), {
        stopReason: "toolUse",
      }),
    ),
    toolResult(4),
    note(5, "R1"),
    // A prune write: no model, nothing shown.
    entry(6, {
      kind: "brunch.prune",
      data: { assistant: entryId(3) },
      edits: [],
    }),
    assistant(7, fauxAssistantMessage("Done.")),
    note(8, "R2"),
  ];
  const live = liveChunks(entries, 7);
  expect(live).toEqual([
    { type: "start", messageId: "durable:1" },
    { type: "start-step" },
    {
      type: "tool-input-available",
      toolCallId: "json",
      toolName: "server_json",
      input: {},
      providerExecuted: true,
      dynamic: undefined,
    },
    { type: "finish-step" },
    {
      type: "tool-output-available",
      toolCallId: "json",
      output: { a: 1 },
      providerExecuted: true,
    },
    {
      type: "data-brunch-hand-edit",
      id: "durable:note:5",
      data: { episode: "e", reportId: "e:5", revision: "R1" },
    },
    { type: "start-step" },
    { type: "text-start", id: "durable:1:text:1" },
    { type: "text-delta", id: "durable:1:text:1", delta: "Done." },
    { type: "text-end", id: "durable:1:text:1" },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ]);

  // History's projection of the same stored entries: the same chunks, and the notes outside.
  const history = projectResponseEntries(entryId(1), entries.slice(1), {
    clientToolNames: new Set(),
  });
  expect(history.chunks).toEqual(live.slice(0, -1));
  expect(history.notesBefore.map(({ id }) => id)).toEqual([2]);
  expect(history.notesAfter.map(({ id }) => id)).toEqual([8]);
});
