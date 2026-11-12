import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { describe, expect, test, vi } from "vitest";

import {
  brunchTools,
  petrinautContextualUserMessageBody,
} from "@hashintel/brunch-agent";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../../test/scripted-model";
import {
  browserCallExtension,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
} from "../../browser-call/browser-call";
import { createPetrinautBrowserToolsExtension } from "../../browser-call/petrinaut-browser-tools";
import { createHostBinding } from "../host-binding";
import {
  type BrowserCallResult,
  contextProjectionExtension,
  projectContext,
} from "./context-projection";

import type { JsonValue } from "@earendil-works/chord";
import type { Message } from "@earendil-works/pi-ai";

const context = BACKGROUND_CONTEXT;
const timestamp = 0;

const user = (
  content: Extract<Message, { role: "user" }>["content"],
): Message => ({
  role: "user",
  content,
  timestamp,
});

const toolResult = (
  toolCallId: string,
  toolName: string,
  output: unknown,
): Message => ({
  role: "toolResult",
  toolCallId,
  toolName,
  isError: false,
  content: [{ type: "text", text: JSON.stringify(output) }],
  timestamp,
});

const metadataOf = (
  documentRevision: { before?: string; after?: string },
  readBack?: JsonValue,
) => ({ documentRevision, ...(readBack === undefined ? {} : { readBack }) });

/** Records as `BrowserCallsDoc` holds them, by tool call ID. */
const resultsFrom =
  (records: Record<string, BrowserCallResult>) => (toolCallId: string) =>
    records[toolCallId];

const texts = (messages: readonly Message[]) =>
  messages.flatMap((message) =>
    message.role === "toolResult"
      ? message.content.flatMap((part) =>
          part.type === "text" ? [JSON.parse(part.text) as unknown] : [],
        )
      : [],
  );

describe("the context projection", () => {
  test("only the latest change shows the read-back, and a later net read supersedes it", () => {
    const records = {
      place: {
        output: { id: "p1" },
        metadata: metadataOf({ before: "r1", after: "r2" }, { places: ["p1"] }),
      },
      arc: {
        output: { id: "a1" },
        metadata: metadataOf(
          { before: "r2", after: "r3" },
          { places: ["p1"], arcs: ["a1"] },
        ),
      },
      read: {
        output: { definition: {} },
        metadata: metadataOf({ before: "r3" }),
      },
    };
    const results = resultsFrom(records);
    const changes = [
      toolResult("place", "addPlace", records.place.output),
      toolResult("arc", "addArc", records.arc.output),
    ];
    expect(texts(projectContext(changes, results))).toEqual([
      { id: "p1" },
      {
        output: { id: "a1" },
        netAfterChanges: { places: ["p1"], arcs: ["a1"] },
      },
    ]);
    const read = toolResult("read", "readNetStructure", records.read.output);
    expect(texts(projectContext([...changes, read], results))).toEqual([
      { id: "p1" },
      { id: "a1" },
      { definition: {} },
    ]);
  });

  test("a change without a record, read-back or later revision shows only its output", () => {
    const place = toolResult("place", "addPlace", { id: "p1" });
    const noReadBack = resultsFrom({
      place: { output: { id: "p1" }, metadata: metadataOf({ after: "r2" }) },
    });
    const noRevision = resultsFrom({
      place: {
        output: { id: "p1" },
        metadata: metadataOf({ before: "r1" }, { places: ["p1"] }),
      },
    });
    for (const results of [resultsFrom({}), noReadBack, noRevision])
      expect(projectContext([place], results)).toEqual([place]);
  });

  test("user messages and server tool results pass through unchanged", () => {
    const input = [
      user("We hold stock."),
      toolResult("c1", brunchTools.ledgerCommit, { status: "recorded" }),
    ];
    expect(projectContext(input, resultsFrom({}))).toEqual(input);
  });

  test("shows the model each user turn as it would read without submission context", () => {
    const submissionContext = {
      interviewBudget: {
        level: "quick",
        questionCap: 3,
        asked: 1,
        remaining: 2,
      },
      words: ["RelayDesk"],
    } as const;
    const diagnosed = petrinautContextualUserMessageBody({
      userText: "Two suppliers.",
      diagnosticsContext: "Selected: Supplier A",
    });
    const input = [
      user(
        petrinautContextualUserMessageBody({
          userText: "We hold stock.",
          diagnosticsContext: "",
          submissionContext,
        }),
      ),
      user([
        {
          type: "text",
          text: petrinautContextualUserMessageBody({
            userText: "Two suppliers.",
            diagnosticsContext: "Selected: Supplier A",
            submissionContext,
          }),
        },
      ]),
      user(diagnosed),
    ];
    const projected = projectContext(input, resultsFrom({}));
    expect(projected).toEqual([
      user("We hold stock."),
      user([{ type: "text", text: diagnosed }]),
      user(diagnosed),
    ]);
    expect(JSON.stringify(projected)).not.toContain("interviewBudget");
    expect(JSON.stringify(projected)).not.toContain("RelayDesk");
  });
});

describe("the context projection on a Harness", () => {
  test("the model receives the projected messages; the transcript keeps the committed ones", async () => {
    const toolCallId = "call-place";
    const input = {
      id: "place-dryer",
      name: "Dryer",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    };
    const output = { id: "place-dryer" };
    const readBack = { places: ["place-dryer"] };
    const seen: Message[][] = [];
    // Net freshness admits the change only against a read before it.
    const readCallId = "call-read";
    const readOutput = { title: "Net" };
    const { models, model } = scriptedModel([
      (request) => {
        seen.push([...request.messages]);
        return fauxAssistantMessage(
          fauxToolCall("readNetOutline", {}, { id: readCallId }),
          { stopReason: "toolUse" },
        );
      },
      (request) => {
        seen.push([...request.messages]);
        return fauxAssistantMessage(
          fauxToolCall("addPlace", input, { id: toolCallId }),
          { stopReason: "toolUse" },
        );
      },
      (request) => {
        seen.push([...request.messages]);
        return fauxAssistantMessage("Added the dryer.");
      },
    ]);
    const host = createHostBinding();
    const petrinautBrowserToolsExtension =
      createPetrinautBrowserToolsExtension(host);
    const registry = createRegistry();
    for (const extension of [
      browserCallExtension,
      petrinautBrowserToolsExtension,
      contextProjectionExtension,
    ])
      registry.install(extension);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry },
      context,
    );
    host.bind(harness);
    try {
      const root = await harness.root(context, {
        agent: {
          model,
          extensions: [
            petrinautBrowserToolsExtension,
            contextProjectionExtension,
          ],
        },
      });
      const submission = await root.submit(
        {
          type: "input",
          content: petrinautContextualUserMessageBody({
            userText: "Add a dryer.",
            diagnosticsContext: "",
            submissionContext: { words: ["RelayDesk"] },
          }),
        },
        context,
      );
      await vi.waitFor(async () => {
        const calls = (
          await harness.snapshot(BrowserCallsDoc, root.id, context)
        )?.calls;
        expect(calls?.[readCallId]).toBeDefined();
      });
      const readClaim = await claimBrowserCall(
        harness,
        root.id,
        readCallId,
        context,
      );
      await finishBrowserCall(
        harness,
        {
          conversationId: root.id,
          toolCallId: readCallId,
          toolName: "readNetOutline",
          capability: readClaim!.capability,
          canonicalInput: readClaim!.input,
          output: readOutput,
          metadata: { documentRevision: { before: "r1" } },
        },
        context,
      );
      await vi.waitFor(async () => {
        const calls = (
          await harness.snapshot(BrowserCallsDoc, root.id, context)
        )?.calls;
        expect(calls?.[toolCallId]).toBeDefined();
      });
      const claim = await claimBrowserCall(
        harness,
        root.id,
        toolCallId,
        context,
      );
      expect(claim).toBeDefined();
      await finishBrowserCall(
        harness,
        {
          conversationId: root.id,
          toolCallId,
          toolName: "addPlace",
          capability: claim!.capability,
          canonicalInput: claim!.input,
          output,
          metadata: metadataOf({ before: "r1", after: "r2" }, readBack),
        },
        context,
      );
      expect((await submission.wait(context)).status).toBe("done");

      expect(seen[0]?.find(({ role }) => role === "user")).toMatchObject({
        content: "Add a dryer.",
      });
      // The read came before the change, so the change keeps its read-back.
      expect(texts(seen[2] ?? [])).toEqual([
        { output: readOutput, netRevision: "r1" },
        { output, netAfterChanges: readBack },
      ]);
      const committed = (
        await root.entries({ order: "ascending" }, 100, undefined, context)
      ).items.flatMap(({ model: messages = [] }) => messages);
      expect(texts(committed)).toEqual([
        { output: readOutput, netRevision: "r1" },
        { output, netAfterChanges: readBack, netRevision: "r2" },
      ]);
      expect(JSON.stringify(committed)).toContain("RelayDesk");
    } finally {
      await harness.close(context);
    }
  });
});
