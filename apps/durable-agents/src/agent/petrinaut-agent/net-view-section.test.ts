/**
 * The `net_view` section on a real Harness with a faux model: after native
 * compaction drops the model's last visible net view, the baseline Pi writes
 * after the head restores it, unless the kept tail decides.
 *
 * Stand-in net tools under the real tool names return the rendered results
 * Phase C gives them, so `visibleNetView` judges them as it judges the real
 * tools. Hand-edit notes are host writes of kind `brunch.hand-edit`. The faux
 * summary never carries a net view, as native summaries need not.
 */
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseFactory,
  type FauxResponseStep,
} from "@earendil-works/pi-ai/providers/faux";
import {
  CompactionEntry,
  type CompactionPolicy,
  type Conversation,
  createRegistry,
  defineExtension,
  defineTool,
  type EntryId,
  Harness,
  MemoryStorage,
  type ModelRef,
  SystemEntry,
  type ToolExecutionResult,
} from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";
import { describe, expect, test } from "vitest";

import {
  allEntries,
  call,
  context,
  shapeOf,
} from "../../../test/platform/support";
import {
  handEditEntryKind,
  netViewSectionKey,
  renderHandEditNote,
  renderNetChange,
  renderNetRead,
  renderNetViewSection,
  renderPlainResult,
  visibleNetView,
} from "../../net-state/visible-net-view";
import { createHostBinding, type HostBinding } from "../host-binding";
import { netViewSectionExtension } from "./net-view-section";

import type { AssistantMessage, Message } from "@earendil-works/pi-ai";

/** A net reader and a canonical change: `mayShowNet` holds for both. */
const readTool = "readNetStructure";
const changeTool = "setNetTitle";

const structureAt = (revision: string) => ({
  revision,
  places: [{ id: "place-dryer", name: "Dryer" }],
});

/** The section as a request shows it, restoring a read at `revision`. */
const restored = (revision: string) =>
  `<${netViewSectionKey}>\n${renderNetViewSection(revision, renderPlainResult(structureAt(revision)))}\n</${netViewSectionKey}>`;

const readResult = (revision: string) =>
  `result:${revision}-read:${renderNetRead(structureAt(revision), revision)}`;

/** Every `net_view` section text the messages hold, in order. */
const sectionsOf = (messages: readonly Message[]) =>
  messages.flatMap((message) =>
    message.role === "system" &&
    typeof message.sections?.[netViewSectionKey] === "string"
      ? [message.sections[netViewSectionKey]]
      : [],
  );

/** The `net_view` section in effect after replaying the messages' patches, as Pi replays them. */
const shownSection = (messages: readonly Message[]) => {
  let shown: string | undefined;
  for (const message of messages) {
    if (message.role !== "system") continue;
    const value = message.sections?.[netViewSectionKey];
    if (value === null) shown = undefined;
    else if (value !== undefined) shown = value;
  }
  return shown;
};

/** A long answer, to put a compaction's cut where a test wants it. */
const filler = (label: string) =>
  `${label} ${"The laundry runs on a schedule. ".repeat(120)}`;

// ─── The faux model ──────────────────────────────────────────────────────────

const summarizerPrompt = "You are a context summarization assistant.";

const isSummarization = (messages: readonly Message[]) => {
  const [first] = messages;
  return (
    first?.role === "system" &&
    typeof first.content === "string" &&
    first.content.startsWith(summarizerPrompt)
  );
};

/**
 * Conversation requests are recorded and answered from a queue;
 * summarization requests are recorded apart and answered with a summary that
 * holds no net view.
 */
const scriptedModel = (contextWindow: number) => {
  const requests: Message[][] = [];
  const summaries: Message[][] = [];
  const queue: FauxResponseStep[] = [];
  const control: { summarize: () => Promise<AssistantMessage> } = {
    summarize: async () => fauxAssistantMessage("## Goal\nModel a laundry."),
  };
  const faux = fauxProvider({
    models: [{ id: "net-view", contextWindow, maxTokens: 4096 }],
  });
  const respond: FauxResponseFactory = async (requestContext, ...rest) => {
    const messages = structuredClone(requestContext.messages);
    if (isSummarization(messages)) {
      summaries.push(messages);
      return control.summarize();
    }
    requests.push(messages);
    const step = queue.shift();
    if (step === undefined) throw new Error("The script is empty.");
    return typeof step === "function" ? step(requestContext, ...rest) : step;
  };
  faux.setResponses(Array.from({ length: 200 }, () => respond));
  const models = createModels();
  models.setProvider(faux.provider);
  const model: ModelRef = {
    provider: faux.provider.id,
    modelId: faux.getModel().id,
  };
  return {
    models,
    model,
    requests,
    summaries,
    control,
    script: (...steps: FauxResponseStep[]) => {
      queue.push(...steps);
    },
  };
};

// ─── Stand-in net tools and hand-edit notes ──────────────────────────────────

const netTools = defineExtension({
  name: "test.net-tools",
  tools: [
    defineTool({
      name: readTool,
      description: "Reads the net.",
      parameters: obj({ revision: str() }),
      execute: async ({ revision }) => ({
        output: [
          {
            type: "text",
            text: renderNetRead(structureAt(revision), revision),
          },
        ],
      }),
    }),
    defineTool({
      name: changeTool,
      description: "Changes the net.",
      parameters: obj({ outcome: str(), revision: str() }),
      execute: async ({ outcome, revision }): Promise<ToolExecutionResult> =>
        outcome === "fail"
          ? {
              // The browser moved the net, but only `details` say so.
              isError: true,
              output: [{ type: "text", text: "The browser did not confirm." }],
              details: { documentRevision: { after: revision } },
            }
          : {
              output: [
                {
                  type: "text",
                  text: renderNetChange(
                    "Title set.",
                    structureAt(revision),
                    revision,
                  ),
                },
              ],
            },
    }),
  ],
});

const read = (revision: string) =>
  call(readTool, `${revision}-read`, { revision });

const failedChange = (revision: string) =>
  call(changeTool, `${revision}-fail`, { outcome: "fail", revision });

/** Admit a hand-edit note, as the hand-edit route does. */
const handEdit = async (root: Conversation, revision: string) => {
  const reportId = `episode-${revision}:1`;
  const submission = await root.submit(
    {
      type: "write",
      requestId: `brunch.hand-edit:${reportId}`,
      entry: {
        kind: handEditEntryKind,
        data: { episode: `episode-${revision}`, reportId, revision },
        model: [
          { role: "user", content: renderHandEditNote(revision), timestamp: 0 },
        ],
      },
    },
    context,
  );
  return submission;
};

// ─── The Harness ─────────────────────────────────────────────────────────────

/** Storage a new Harness can reopen after `Harness.close()`. */
class RetainedStorage extends MemoryStorage {
  override async close() {
    // Kept open for the next Harness.
  }
}

/** A host binding whose `conversation` throws while `failing` is set. */
const failableHost = () => {
  const inner = createHostBinding();
  const state = { failing: false };
  const host: HostBinding = {
    bind: inner.bind,
    conversation: async (conversationId, ctx) => {
      if (state.failing) throw new Error("The host failed.");
      return inner.conversation(conversationId, ctx);
    },
  };
  return { host, state };
};

/**
 * A Harness over `storage` whose root selects the stand-in tools and the
 * section over `host`, bound right after open. Compaction is off until a test
 * enables it; settings are read at each use.
 */
const open = async (options?: {
  storage?: MemoryStorage;
  host?: HostBinding;
  bind?: boolean;
  contextWindow?: number;
}) => {
  const model = scriptedModel(options?.contextWindow ?? 128_000);
  const host = options?.host ?? createHostBinding();
  const compaction: CompactionPolicy = {
    enabled: false,
    keepRecentTokens: 1,
    reserveTokens: 16_384,
    backgroundTokens: 0,
  };
  const section = netViewSectionExtension(host);
  const registry = createRegistry();
  registry.install(netTools);
  registry.install(section);
  const storage = options?.storage ?? new RetainedStorage();
  const harness = await Harness.open(
    storage,
    { models: model.models, registry, settings: () => ({ compaction }) },
    context,
  );
  if (options?.bind ?? true) host.bind(harness);
  const root = await harness.root(context, {
    agent: { model: model.model, extensions: [netTools, section] },
  });
  const ask = async (content: string) => {
    const submission = await root.submit({ type: "input", content }, context);
    expect((await submission.wait(context)).status).toBe("done");
  };
  const compact = async () => {
    const task = await root.compact(undefined, context);
    return (await harness.waitForTask(task, context)).state.outcome;
  };
  return {
    harness,
    root,
    storage,
    model,
    compaction,
    ask,
    compact,
    close: () => harness.close(context),
  };
};

type Opened = Awaited<ReturnType<typeof open>>;

/** The newest entry before `id`. */
const entryBefore = async (root: Conversation, id: EntryId) => {
  const before = (
    await root.entries(
      { maxEntryId: (id - 1) as EntryId, order: "descending" },
      1,
      undefined,
      context,
    )
  ).items[0]?.id;
  if (before === undefined) throw new Error("No entry before it.");
  return before;
};

const compactionHead = async (root: Conversation) => {
  const { head } = await root.context(context);
  if (!CompactionEntry.is(head)) throw new Error("No compaction head.");
  return head;
};

/** The first assistant entry after `after`. */
const firstAnswerAfter = async (root: Conversation, after: EntryId) => {
  const answer = (await allEntries(root)).find(
    (entry) => entry.id > after && entry.kind === "pi.assistant",
  );
  if (answer === undefined) throw new Error("No answer after it.");
  return answer.id;
};

/** The committed context the first request after the compaction was prepared from. */
const committedAfterHead = async (root: Conversation) => {
  const head = await compactionHead(root);
  const answer = await firstAnswerAfter(root, head.id);
  return (await root.context(context, { at: await entryBefore(root, answer) }))
    .messages;
};

/** Ask once more; returns the request that turn made. */
const askOnce = async (probe: Opened, content: string) => {
  probe.model.script(fauxAssistantMessage("OK."));
  const before = probe.model.requests.length;
  await probe.ask(content);
  const request = probe.model.requests[before];
  if (request === undefined) throw new Error("No request.");
  return request;
};

const systemEntriesAfter = async (root: Conversation, id: EntryId) =>
  (await allEntries(root)).filter(
    (entry) => SystemEntry.is(entry) && entry.id > id,
  );

/** Read the net at R1, then chat once: the read sits early in the transcript. */
const readThenChat = async (probe: Opened) => {
  probe.model.script(
    read("R1"),
    fauxAssistantMessage("It has a dryer."),
    fauxAssistantMessage("Noted."),
  );
  await probe.ask("Look at the net.");
  await probe.ask("It dries clothes.");
};

const hasRead = (request: readonly Message[], revision: string) =>
  shapeOf(request).some((shape) => shape.startsWith(`result:${revision}-read`));

// ─── Obligations ─────────────────────────────────────────────────────────────

describe("the net_view section", () => {
  test("1: a manual compaction drops the read; the first request after it leads with the restored view, as stored", async () => {
    const probe = await open();
    try {
      await readThenChat(probe);
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const request = await askOnce(probe, "Add a second dryer.");
      expect(hasRead(request, "R1")).toBe(false);
      expect(probe.model.summaries).toHaveLength(1);
      expect(request[0]).toMatchObject({
        role: "system",
        sections: { [netViewSectionKey]: restored("R1") },
      });
      // No rewrite: the request is the committed context before its answer.
      expect(request).toEqual(await committedAfterHead(probe.root));
    } finally {
      await probe.close();
    }
  });

  test("1: a blocking threshold compaction inside a run; the request right after it carries the view", async () => {
    const probe = await open({ contextWindow: 4000 });
    try {
      probe.model.script(
        read("R1"),
        fauxAssistantMessage(filler("One.")),
        fauxAssistantMessage(filler("Two.")),
        fauxAssistantMessage(filler("Three.")),
      );
      await probe.ask("Look at the net.");
      await probe.ask("More.");
      await probe.ask("More still.");
      Object.assign(probe.compaction, {
        enabled: true,
        reserveTokens: 2000,
        keepRecentTokens: 1,
      });
      const request = await askOnce(probe, "Add a second dryer.");
      probe.compaction.enabled = false;
      expect(probe.model.summaries).toHaveLength(1);
      expect((await compactionHead(probe.root)).data).toEqual({
        reason: "threshold",
      });
      expect(hasRead(request, "R1")).toBe(false);
      expect(sectionsOf(request)).toEqual([restored("R1")]);
      expect(request).toEqual(await committedAfterHead(probe.root));
    } finally {
      await probe.close();
    }
  });

  test("2: the view is in the kept tail; nothing is restored, so it shows once", async () => {
    const probe = await open();
    try {
      probe.model.script(
        fauxAssistantMessage(filler("Hello.")),
        read("R1"),
        fauxAssistantMessage("It has a dryer."),
      );
      await probe.ask("Hello.");
      await probe.ask("Look at the net.");
      // Cut after the long answer: the read stays verbatim.
      probe.compaction.keepRecentTokens = 300;
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const request = await askOnce(probe, "Add a second dryer.");
      expect(shapeOf(request)).toContain(readResult("R1"));
      expect(sectionsOf(request)).toEqual([]);
      expect(visibleNetView(await probe.root.context(context))).toMatchObject({
        state: "current",
        revision: "R1",
        kind: "read",
      });
    } finally {
      await probe.close();
    }
  });

  test("3: a note after the view, both summarized: the stale prefix restores nothing", async () => {
    const probe = await open();
    try {
      probe.model.script(
        read("R1"),
        fauxAssistantMessage("It has a dryer."),
        fauxAssistantMessage("Fine."),
      );
      await probe.ask("Look at the net.");
      await handEdit(probe.root, "R2");
      await probe.ask("Anything else?");
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const request = await askOnce(probe, "Add a dryer.");
      expect(
        shapeOf(request).some((shape) => shape.includes("<hand-edit")),
      ).toBe(false);
      expect(sectionsOf(request)).toEqual([]);
      expect(visibleNetView(await probe.root.context(context))).toEqual({
        state: "none",
      });
    } finally {
      await probe.close();
    }
  });

  test("3: a note after the view, the note kept in the tail: the tail decides, nothing is restored", async () => {
    const probe = await open();
    try {
      probe.model.script(
        read("R1"),
        fauxAssistantMessage(filler("It has a dryer.")),
        fauxAssistantMessage("Fine."),
      );
      await probe.ask("Look at the net.");
      await handEdit(probe.root, "R2");
      await probe.ask("Anything else?");
      probe.compaction.keepRecentTokens = 300;
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const request = await askOnce(probe, "Add a dryer.");
      // The read was summarized; the note was kept.
      expect(hasRead(request, "R1")).toBe(false);
      expect(shapeOf(request)).toContain(`user:${renderHandEditNote("R2")}`);
      expect(sectionsOf(request)).toEqual([]);
      expect(visibleNetView(await probe.root.context(context))).toEqual({
        state: "none",
      });
    } finally {
      await probe.close();
    }
  });

  test("4: it restores the last visible view, not a revision only a failed change's details name", async () => {
    const probe = await open();
    try {
      probe.model.script(
        read("R1"),
        fauxAssistantMessage("It has a dryer."),
        failedChange("R2"),
        fauxAssistantMessage("That failed."),
      );
      await probe.ask("Look at the net.");
      await probe.ask("Rename it.");
      const failed = (await probe.root.context(context)).messages.find(
        (message) =>
          message.role === "toolResult" && message.toolCallId === "R2-fail",
      );
      expect(failed).toMatchObject({
        isError: true,
        details: { documentRevision: { after: "R2" } },
      });
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const request = await askOnce(probe, "Add an iron.");
      expect(sectionsOf(request)).toEqual([restored("R1")]);
    } finally {
      await probe.close();
    }
  });

  test("5: a second compaction keeps the view, though the restored section itself was summarized", async () => {
    const probe = await open();
    try {
      await readThenChat(probe);
      await probe.compact();
      const firstHead = await compactionHead(probe.root);
      await askOnce(probe, "Add a second dryer.");
      const [baseline] = await systemEntriesAfter(probe.root, firstHead.id);
      if (baseline === undefined) throw new Error("No baseline.");
      probe.model.script(fauxAssistantMessage("Sure."));
      await probe.ask("And a third?");
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const secondHead = await compactionHead(probe.root);
      const request = await askOnce(probe, "Go on.");
      expect(secondHead.id).not.toBe(firstHead.id);
      // The first restoration's baseline sat in the summarized prefix.
      expect(baseline.id).toBeLessThan(secondHead.head ?? 0);
      expect(probe.model.summaries).toHaveLength(2);
      expect(JSON.stringify(probe.model.summaries[1])).not.toContain(
        "<net-view",
      );
      expect(sectionsOf(request)).toEqual([restored("R1")]);
      expect(request).toEqual(await committedAfterHead(probe.root));
    } finally {
      await probe.close();
    }
  });

  test("6: a fresh Harness and binding over the same storage, before the first request after compaction, restores the view", async () => {
    const first = await open();
    let reopened: Opened | undefined;
    try {
      await readThenChat(first);
      expect(await first.compact()).toMatchObject({ status: "completed" });
      await first.close();
      reopened = await open({ storage: first.storage });
      const request = await askOnce(reopened, "Add a second dryer.");
      // The new Harness made the request.
      expect(reopened.model.requests).toHaveLength(1);
      expect(sectionsOf(request)).toEqual([restored("R1")]);
      expect(request).toEqual(await committedAfterHead(reopened.root));
    } finally {
      await reopened?.close();
    }
  });

  test("7: when the section throws, it renders nothing, not its earlier text", async () => {
    const { host, state } = failableHost();
    const probe = await open({ host });
    try {
      await readThenChat(probe);
      await probe.compact();
      expect(sectionsOf(await askOnce(probe, "Add a dryer."))).toEqual([
        restored("R1"),
      ]);
      state.failing = true;
      // Pi keeps a throwing section's shown text; this one removes it.
      const request = await askOnce(probe, "Go on.");
      expect(shownSection(request)).toBeUndefined();
      expect(
        request.some(
          (message) =>
            message.role === "system" &&
            message.sections?.[netViewSectionKey] === null,
        ),
      ).toBe(true);
    } finally {
      await probe.close();
    }
  });

  test("7: an unbound host renders nothing after a compaction", async () => {
    const probe = await open({ bind: false });
    try {
      await readThenChat(probe);
      await probe.compact();
      const request = await askOnce(probe, "Add a dryer.");
      expect(sectionsOf(request)).toEqual([]);
      expect(visibleNetView(await probe.root.context(context))).toEqual({
        state: "none",
      });
    } finally {
      await probe.close();
    }
  });

  test("8: visibleNetView counts the restored section as the view at the head, and a later note makes it stale", async () => {
    const probe = await open();
    try {
      await readThenChat(probe);
      await probe.compact();
      await askOnce(probe, "Add a dryer.");
      const view = await probe.root.context(context);
      const restoredView = visibleNetView(view);
      expect(restoredView).toMatchObject({
        state: "current",
        revision: "R1",
        kind: "section",
        body: renderPlainResult(structureAt("R1")),
      });
      // The section leads the context.
      expect(restoredView.state === "current" && restoredView.message).toBe(
        view.messages[0],
      );
      await handEdit(probe.root, "R2");
      expect(visibleNetView(await probe.root.context(context))).toMatchObject({
        state: "stale",
        seen: "R1",
        edited: "R2",
      });
    } finally {
      await probe.close();
    }
  });

  test("9: stable until the next compaction: a later read and note add no system entry, and every request shows the same section", async () => {
    const probe = await open();
    try {
      await readThenChat(probe);
      await probe.compact();
      const head = await compactionHead(probe.root);
      const first = await askOnce(probe, "Add a second dryer.");
      probe.model.script(read("R2"), fauxAssistantMessage("Washer seen."));
      await probe.ask("Look again.");
      await handEdit(probe.root, "R3");
      const last = await askOnce(probe, "Go on.");
      // Only the baseline Pi writes after every head anyway.
      expect(await systemEntriesAfter(probe.root, head.id)).toHaveLength(1);
      const after = probe.model.requests.slice(
        probe.model.requests.indexOf(first),
      );
      expect(after).toHaveLength(4);
      for (const request of after)
        expect(sectionsOf(request)).toEqual([restored("R1")]);
      // The request's leading prefix is unchanged between them.
      expect(last[0]).toEqual(first[0]);
      expect(visibleNetView(await probe.root.context(context))).toMatchObject({
        state: "stale",
        seen: "R2",
        edited: "R3",
      });
    } finally {
      await probe.close();
    }
  });
});
