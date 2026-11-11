/**
 * P2: `Conversation.context({ at })` as the model's view at tool time.
 *
 * - Agreement: on transcripts the real Petrinaut browser tools write (the
 *   fold-1 cases of `src/net-state/net-freshness.test.ts`, and edits, a reset
 *   and a compaction besides), a derivation over `context({ at })` gives the
 *   same viewed calls and the same expected revision as `viewedCalls`
 *   (`model-context.ts`) with `expectedNetRevision`, at every assistant entry
 *   that issued calls.
 * - Reach: a tool has no `context()` on its API in 1.5.0; it reaches it
 *   through the Harness it closes over, outside `api.commit`.
 * - Cost: timings of both derivations over a long transcript.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CompactionTask,
  type Conversation,
  type ConversationId,
  createRegistry,
  defineExtension,
  defineTool,
  type EntryId,
  Harness,
  hook,
  type JsonObject,
  MemoryStorage,
  type ModelRef,
  type Storage,
  type ToolTaskInput,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { obj } from "@earendil-works/pi-schema";
import { describe, expect, test, vi } from "vitest";

import { parseClientToolResultMetadata } from "@hashintel/brunch-agent";

import {
  bindBrowserDocument,
  browserCallExtension,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
} from "../../src/browser-call/browser-call";
import { petrinautBrowserToolsExtension } from "../../src/browser-call/petrinaut-browser-tools";
import {
  expectedNetRevision,
  noNetViewRefusal,
  viewedCalls,
} from "../../src/net-state/net-freshness";
import { netResultView } from "../../src/net-state/net-view";
import {
  allEntries,
  call,
  context,
  fauxAssistantMessage,
  recordingModel,
  resultEntry,
} from "./support";

import type { ViewedCall } from "../../src/net-state/net-freshness/model-context";
import type { Message } from "@earendil-works/pi-ai";
import type { Models } from "@earendil-works/pi-ai/models";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

const place = {
  id: "place-dryer",
  name: "Dryer",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

const readMetadata = (revision: string) => ({
  documentRevision: { before: revision },
});

// ─── The derivation over context({ at }) ─────────────────────────────────────

/** The calls whose successful results are in `messages`, in issue order: `viewedCalls` over a derived context. */
const viewedCallsInContext = (messages: readonly Message[]): ViewedCall[] => {
  const rounds: { calls: ViewedCall[]; succeeded: Set<string> }[] = [];
  for (const message of messages) {
    if (message.role === "assistant")
      rounds.push({
        calls: message.content.flatMap((part) =>
          part.type === "toolCall"
            ? [{ toolCallId: part.id, toolName: part.name }]
            : [],
        ),
        succeeded: new Set(),
      });
    else if (message.role === "toolResult" && !message.isError)
      rounds.at(-1)?.succeeded.add(message.toolCallId);
  }
  return rounds.flatMap(({ calls, succeeded }) =>
    calls.filter(({ toolCallId }) => succeeded.has(toolCallId)),
  );
};

/**
 * The expected revision from the context alone: a browser result's message
 * carries the tool's `details`, Brunch's envelope with the browser's
 * metadata, so no browser-call record is read.
 */
const expectedRevisionInContext = (
  messages: readonly Message[],
): { readonly revision: string } | { readonly refusal: string } => {
  const viewed = new Set(
    viewedCallsInContext(messages).map(({ toolCallId }) => toolCallId),
  );
  let revision: string | undefined;
  for (const message of messages) {
    if (message.role !== "toolResult" || !viewed.has(message.toolCallId))
      continue;
    const details = message.details as { metadata?: unknown } | undefined;
    revision =
      netResultView(message.toolName, details?.metadata)?.revision ?? revision;
  }
  return revision === undefined ? { refusal: noNetViewRefusal } : { revision };
};

// ─── Scenarios through the real browser tools ────────────────────────────────

const summaryHook = defineExtension({
  name: "probe.summary",
  hooks: [
    hook(CompactionTask, {
      beforeCompact: () => ({ summary: "We talked about the net." }),
    }),
  ],
});

const openHarness = (storage: Storage, models: Models) => {
  const registry = createRegistry();
  registry.install(browserCallExtension);
  registry.install(petrinautBrowserToolsExtension);
  registry.install(summaryHook);
  return Harness.open(
    storage,
    { models, registry, settings: { compaction: { keepRecentTokens: 1 } } },
    context,
  );
};

const openRoot = async (harness: Harness, model: ModelRef) => {
  const root = await harness.root(context, {
    agent: {
      model,
      extensions: [petrinautBrowserToolsExtension, summaryHook],
    },
  });
  await harness.commit(
    (tx) =>
      bindBrowserDocument(tx, root.id, {
        conversationId: "conversation-1",
        documentId: "net-1",
      }),
    context,
  );
  return root;
};

/** The browser's side: claim the issued call and finish it. */
const answer = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  output: unknown,
  metadata?: unknown,
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

const turn = async (
  conversation: Conversation,
  content: string,
  browser: () => Promise<void> = async () => undefined,
) => {
  const submission = await conversation.submit(
    { type: "input", content },
    context,
  );
  await browser();
  expect((await submission.wait(context)).status).toBe("done");
};

/** Both derivations at every assistant entry that issued calls. */
const compareAll = async (harness: Harness, conversation: Conversation) => {
  const calls =
    (await harness.snapshot(BrowserCallsDoc, conversation.id, context))
      ?.calls ?? {};
  const issuing = (await allEntries(conversation)).filter(
    (entry) =>
      entry.kind === "pi.assistant" &&
      entry.model?.[0]?.role === "assistant" &&
      entry.model[0].content.some((part) => part.type === "toolCall"),
  );
  return Promise.all(
    issuing.map(async (entry) => {
      const viewed = await harness.commit(
        (tx) => viewedCalls(tx, conversation.id, entry.id),
        context,
      );
      const { messages } = await conversation.context(context, {
        at: entry.id,
      });
      return {
        entry: entry.id,
        viewed,
        inContext: viewedCallsInContext(messages),
        expected: expectedNetRevision(viewed, calls),
        expectedInContext: expectedRevisionInContext(messages),
      };
    }),
  );
};

const expectAgreement = (
  rows: Awaited<ReturnType<typeof compareAll>>,
): void => {
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.inContext).toEqual(row.viewed);
    expect(row.expectedInContext).toEqual(row.expected);
  }
};

/** A harness, its root, and its responses, over memory. */
const scenario = async (responses: FauxResponseStep[]) => {
  const { models, model } = recordingModel(responses);
  const harness = await openHarness(new MemoryStorage(), models);
  const root = await openRoot(harness, model);
  return { harness, root };
};

const lastExpected = (rows: Awaited<ReturnType<typeof compareAll>>) =>
  rows.at(-1)!.expectedInContext;

describe("P2: context({ at }) agrees with model-context.ts on the fold-1 cases", () => {
  test("a change with no read: both refuse", async () => {
    const { harness, root } = await scenario([
      call("addPlace", "add-1", place),
      fauxAssistantMessage("I could not add it."),
    ]);
    await turn(root, "Add a dryer.");
    const rows = await compareAll(harness, root);
    expectAgreement(rows);
    expect(lastExpected(rows)).toEqual({ refusal: noNetViewRefusal });
    await harness.close(context);
  });

  test("a read, then a change: both give the read's revision, the context from the result's details alone", async () => {
    const { harness, root } = await scenario([
      call("readNetOutline", "read-1"),
      call("addPlace", "add-1", place),
      fauxAssistantMessage("Added the dryer."),
    ]);
    await turn(root, "Add a dryer.", async () => {
      await answer(
        harness,
        root.id,
        "read-1",
        { title: "Net" },
        readMetadata("revision-1"),
      );
      await answer(harness, root.id, "add-1", { applied: true });
    });
    const rows = await compareAll(harness, root);
    expectAgreement(rows);
    expect(lastExpected(rows)).toEqual({ revision: "revision-1" });
    // The browser's metadata is on the model message, as `details`.
    const read = resultEntry(await allEntries(root), "read-1")?.model?.[0];
    expect(
      parseClientToolResultMetadata(
        (read?.role === "toolResult"
          ? (read.details as { metadata?: unknown } | undefined)
          : undefined
        )?.metadata,
      )?.documentRevision.before,
    ).toBe("revision-1");
    await harness.close(context);
  });

  test("a read whose browser reported no revision: both refuse", async () => {
    const { harness, root } = await scenario([
      call("readNetOutline", "read-1"),
      call("addPlace", "add-1", place),
      fauxAssistantMessage("I could not add it."),
    ]);
    await turn(root, "Add a dryer.", () =>
      answer(harness, root.id, "read-1", { title: "Net" }),
    );
    const rows = await compareAll(harness, root);
    expectAgreement(rows);
    expect(lastExpected(rows)).toEqual({ refusal: noNetViewRefusal });
    await harness.close(context);
  });

  test("after a restart: both give the earlier read's revision", async () => {
    const directory = await mkdtemp(join(tmpdir(), "durable-platform-p2-"));
    const file = join(directory, "session.sqlite");
    const { models, model } = recordingModel([
      call("readNetOutline", "read-1"),
      fauxAssistantMessage("The net is empty."),
      call("addPlace", "add-1", place),
      fauxAssistantMessage("Added the dryer."),
    ]);
    try {
      const first = await openHarness(
        await openNodeSqliteStorage(file),
        models,
      );
      const before = await openRoot(first, model);
      await turn(before, "What is in the net?", () =>
        answer(
          first,
          before.id,
          "read-1",
          { title: "Net" },
          readMetadata("revision-1"),
        ),
      );
      await first.close(context);
      const second = await openHarness(
        await openNodeSqliteStorage(file),
        models,
      );
      const root = await second.root(context);
      await turn(root, "Add a dryer.", () =>
        answer(second, root.id, "add-1", { applied: true }),
      );
      const rows = await compareAll(second, root);
      expectAgreement(rows);
      expect(lastExpected(rows)).toEqual({ revision: "revision-1" });
      await second.close(context);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("P2: agreement beyond the fold-1 cases", () => {
  const readThenChange =
    (between: (harness: Harness, root: Conversation) => Promise<void>) =>
    async () => {
      const { harness, root } = await scenario([
        call("readNetOutline", "read-1"),
        fauxAssistantMessage("Read it."),
        call("addPlace", "add-1", place),
        fauxAssistantMessage("Done or refused."),
      ]);
      await turn(root, "Read the net.", () =>
        answer(
          harness,
          root.id,
          "read-1",
          { title: "Net" },
          readMetadata("revision-1"),
        ),
      );
      await between(harness, root);
      const settled = turn(root, "Add a dryer.");
      // Admitted changes need a browser; a refused one does not.
      const pending = vi
        .waitFor(async () => {
          const calls = (
            await harness.snapshot(BrowserCallsDoc, root.id, context)
          )?.calls;
          expect(calls?.["add-1"]?.status).toBe("pending");
        })
        .then(() => answer(harness, root.id, "add-1", { applied: true }))
        .catch(() => undefined);
      await settled;
      await pending;
      const rows = await compareAll(harness, root);
      expectAgreement(rows);
      await harness.close(context);
      return lastExpected(rows);
    };

  test("an edit that omits the read's result: both refuse", async () => {
    const expected = await readThenChange(async (_harness, root) => {
      const read = resultEntry(await allEntries(root), "read-1")!;
      await root.submit(
        {
          type: "write",
          entry: {
            kind: "probe.omit",
            edits: [{ target: read.id, action: "omit" }],
          },
        },
        context,
      );
    })();
    expect(expected).toEqual({ refusal: noNetViewRefusal });
  });

  test("a reset after the read: both refuse", async () => {
    const expected = await readThenChange((_harness, root) =>
      root.reset(undefined, context),
    )();
    expect(expected).toEqual({ refusal: noNetViewRefusal });
  });

  test("a compaction that cuts the read away: both refuse", async () => {
    const expected = await readThenChange(async (harness, root) => {
      const task = await root.compact(undefined, context);
      const { state } = await harness.waitForTask(task, context);
      expect(state.outcome.status).toBe("completed");
      const head = (await root.context(context)).head;
      expect(head?.kind).toBe("pi.compaction");
    })();
    expect(expected).toEqual({ refusal: noNetViewRefusal });
  });
});

// ─── Reach and cost ─────────────────────────────────────────────────────────

describe("P2: reaching context() from tool code, and what it costs", () => {
  test("a tool reads context({ at: its assistant entry }) through the Harness it closes over, and it matches viewedCalls in its own commit", async () => {
    const harnessRef: { current?: Harness } = {};
    const observed: { viewed: unknown; inContext: unknown }[] = [];
    const probe = defineTool({
      name: "probe_view",
      description: "Reports the model's view at its call.",
      parameters: obj({}),
      execute: async (_args, api, toolContext) => {
        const input = (await api.getTask(api.taskId, toolContext))
          ?.input as ToolTaskInput;
        if (input.kind !== "model") throw new Error("Not a model call.");
        // Outside api.commit: a Harness read inside the commit would wait on the line the commit holds.
        const conversation = await harnessRef.current!.conversation(
          api.conversationId,
          toolContext,
        );
        const { messages } = await conversation!.context(toolContext, {
          at: input.assistant,
        });
        const viewed = await api.commit(
          (tx) => viewedCalls(tx, api.conversationId, input.assistant),
          toolContext,
        );
        observed.push({ viewed, inContext: viewedCallsInContext(messages) });
        return { output: [{ type: "text", text: "ok" }] };
      },
    });
    const echo = defineTool({
      name: "echo",
      description: "Echoes.",
      parameters: obj({}),
      execute: async () => ({ output: [{ type: "text", text: "echo" }] }),
    });
    const { models, model } = recordingModel([
      call("echo", "e1"),
      call("probe_view", "p1"),
      fauxAssistantMessage("done"),
    ]);
    const registry = createRegistry();
    registry.install(defineExtension({ name: "probe", tools: [probe, echo] }));
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry },
      context,
    );
    harnessRef.current = harness;
    const root = await harness.root(context, { agent: { model } });
    await turn(root, "go");
    expect(observed).toEqual([
      {
        viewed: [{ toolCallId: "e1", toolName: "echo" }],
        inContext: [{ toolCallId: "e1", toolName: "echo" }],
      },
    ]);
    await harness.close(context);
  });

  test("cost over a long transcript: context({ at }) and viewedCalls, timed", async () => {
    const harness = await Harness.open(
      new MemoryStorage(),
      { models: recordingModel([]).models, registry: createRegistry() },
      context,
    );
    const conversation = await harness.createConversation(
      { ownership: { kind: "ownerless" } },
      context,
    );
    const rounds = 500;
    const usage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    let last: EntryId | undefined;
    for (let round = 0; round < rounds; round++) {
      const id = `call-${round}`;
      // eslint-disable-next-line no-await-in-loop -- Rounds append in order.
      last = await conversation.commit(async (tx) => {
        await tx.appendEntry(conversation.id, {
          kind: "probe.user",
          model: [{ role: "user", content: `turn ${round}`, timestamp: 0 }],
        });
        const assistant = await tx.appendEntry(conversation.id, {
          kind: "pi.assistant",
          model: [
            {
              role: "assistant",
              content: [
                {
                  type: "toolCall",
                  id,
                  name: "readNetOutline",
                  arguments: {} as JsonObject,
                },
              ],
              api: "faux",
              provider: "faux",
              model: "faux",
              usage,
              stopReason: "toolUse",
              timestamp: 0,
            },
          ],
        });
        await tx.appendEntry(conversation.id, {
          kind: "pi.tool-result",
          model: [
            {
              role: "toolResult",
              toolCallId: id,
              toolName: "readNetOutline",
              content: [{ type: "text", text: "{}" }],
              details: { metadata: readMetadata(`revision-${round}`) },
              isError: false,
              timestamp: 0,
            },
          ],
        });
        return assistant.id;
      }, context);
    }
    const time = async <T>(run: () => Promise<T>) => {
      const start = performance.now();
      const value = await run();
      return { value, ms: performance.now() - start };
    };
    const cold = await time(() => conversation.context(context, { at: last }));
    const warm = await time(() => conversation.context(context, { at: last }));
    const current = await time(() => conversation.context(context));
    const scanned = await time(() =>
      harness.commit((tx) => viewedCalls(tx, conversation.id, last!), context),
    );
    expect(viewedCallsInContext(warm.value.messages)).toEqual(scanned.value);
    expect(expectedRevisionInContext(warm.value.messages)).toEqual({
      revision: `revision-${rounds - 2}`,
    });
    process.stdout.write(
      `P2 cost, ${rounds * 3} entries: context({at}) cold ${cold.ms.toFixed(1)} ms, again ${warm.ms.toFixed(1)} ms, context() current ${current.ms.toFixed(1)} ms; viewedCalls in a commit ${scanned.ms.toFixed(1)} ms\n`,
    );
    await harness.close(context);
  });
});
