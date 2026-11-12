import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ConversationId,
  createRegistry,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { describe, expect, test, vi } from "vitest";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../test/scripted-model";
import { createHostBinding } from "../agent/host-binding";
import { mayShowNet } from "../net-state/net-view";
import { renderNetChange } from "../net-state/visible-net-view";
import {
  bindBrowserDocument,
  browserCallExtension,
  type BrowserCallResult,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
  netToolOutputLimits,
} from "./browser-call";
import {
  createPetrinautBrowserToolsExtension,
  petrinautBrowserTools,
} from "./petrinaut-browser-tools";

const context = BACKGROUND_CONTEXT;

/**
 * The Petrinaut browser tools as the model receives them: name, description
 * and parameter JSON Schema, in order. The snapshot pins what a real OpenAI
 * run accepted; a change to it is a change to what the model is sent, from
 * this package's conversion or from the libraries' tool definitions.
 */
test("the Petrinaut browser tools reach the model with the pinned definitions", async () => {
  const definitions = petrinautBrowserTools.map(
    ({ name, description, parameters }) => ({ name, description, parameters }),
  );
  expect(definitions).toHaveLength(49);
  await expect(`${JSON.stringify(definitions, null, 2)}\n`).toMatchFileSnapshot(
    "./__snapshots__/petrinaut-browser-tools.snap.json",
  );
});

test("the extension over a host carries the pinned definitions, and every tool that may show the net gets the 256 KiB bound (H10)", () => {
  const { tools = [] } =
    createPetrinautBrowserToolsExtension(createHostBinding());
  expect(
    tools.map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    })),
  ).toEqual(
    petrinautBrowserTools.map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    })),
  );
  const bounded = tools.filter(
    ({ outputLimits }) => outputLimits !== undefined,
  );
  expect(bounded.map(({ name }) => name)).toEqual(
    tools.map(({ name }) => name).filter(mayShowNet),
  );
  expect(bounded.length).toBeGreaterThan(40);
  for (const tool of bounded)
    expect(tool.outputLimits).toEqual({ maxBytes: 256 * 1024 });
  expect(netToolOutputLimits).toEqual({ maxBytes: 256 * 1024 });
});

// ─── The output bound, through the real tool path ────────────────────────────

const place = {
  id: "place-dryer",
  name: "Dryer",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};

const changeOutput = { applied: true };
const readBackOf = (padding: number) => ({
  places: [{ id: place.id }],
  padding: "x".repeat(padding),
});

/** A read-back whose rendered change result is exactly `bytes` long (ASCII). */
const readBackRenderingTo = (bytes: number) => {
  const base = renderNetChange(changeOutput, readBackOf(0), "R2").length;
  return readBackOf(bytes - base);
};

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

const call = (toolName: string, id: string, args: object = {}) =>
  fauxAssistantMessage(fauxToolCall(toolName, { ...args }, { id }), {
    stopReason: "toolUse",
  });

describe("the output bound on a change's read-back", () => {
  test.each([
    ["over Pi's default 50 KiB", 60 * 1024, "complete"],
    ["exactly at 256 KiB", 256 * 1024, "complete"],
    ["one byte over 256 KiB", 256 * 1024 + 1, "cut"],
  ] as const)(
    "a read-back %s (%i bytes) arrives %s; a cut one is not a view, so the next change keeps the earlier read's revision",
    async (_name, bytes, arrives) => {
      const { models, model } = scriptedModel([
        call("readNetOutline", "read"),
        call("addPlace", "big", place),
        call("addPlace", "next", { ...place, id: "place-washer" }),
        fauxAssistantMessage("Done."),
      ]);
      const host = createHostBinding();
      const tools = createPetrinautBrowserToolsExtension(host);
      const registry = createRegistry();
      registry.install(browserCallExtension);
      registry.install(tools);
      const harness = await Harness.open(
        new MemoryStorage(),
        // The faux model's window is small: a 256 KiB result would compact.
        { models, registry, settings: { compaction: { enabled: false } } },
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
          { type: "input", content: "Add a dryer and a washer." },
          context,
        );
        const readBack = readBackRenderingTo(bytes);
        await answer(
          harness,
          root.id,
          "read",
          { title: "Net" },
          { documentRevision: { before: "R1" } },
        );
        await answer(harness, root.id, "big", changeOutput, {
          documentRevision: { before: "R1", after: "R2" },
          readBack,
        });
        await answer(harness, root.id, "next", changeOutput);
        const settled = await submission.wait(context);
        expect(settled).toMatchObject({ status: "done" });

        const { messages } = await root.context(context);
        const big = messages.find(
          (message) =>
            message.role === "toolResult" && message.toolCallId === "big",
        );
        const texts =
          big?.role === "toolResult"
            ? big.content.flatMap((part) =>
                part.type === "text" ? [part.text] : [],
              )
            : [];
        const rendered = renderNetChange(changeOutput, readBack, "R2");
        expect(rendered.length).toBe(bytes);
        const next = (await harness.snapshot(BrowserCallsDoc, root.id, context))
          ?.calls.next;
        expect({
          exact: texts.length === 1 && texts[0] === rendered,
          truncated: (texts.at(-1) ?? "").startsWith(
            "<harness>\n[warn] Output truncated",
          ),
          nextIssuedAgainst: next?.expectedRevision,
        }).toEqual(
          arrives === "complete"
            ? { exact: true, truncated: false, nextIssuedAgainst: "R2" }
            : { exact: false, truncated: true, nextIssuedAgainst: "R1" },
        );
      } finally {
        await harness.close(context);
      }
    },
  );
});
