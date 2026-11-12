/**
 * The read-back pruning hook over the real Petrinaut browser tools, with the
 * browser scripted through the real `BrowserCall` path: after every tool
 * round, every read-back but the latest visible view's is pruned by one
 * stored `brunch.prune` write, decided from the round's actual outcomes.
 *
 * Cases follow `probes-after-tools.md` (obligations 1, 3, 4, 5, 6 and 9) and
 * the fold redesign's proof obligations 1, 3, 7, 8 and 9.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { awaitWithContext } from "@earendil-works/chord/context";
import {
  type Conversation,
  type ConversationId,
  createRegistry,
  defineExtension,
  type EntryId,
  GenerationTask,
  Harness,
  hook,
  MemoryStorage,
  type Report,
  type Storage,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  allEntries,
  calls,
  context,
  fauxAssistantMessage,
  kindsOf,
  recordingModel,
  resultEntry,
  textOf,
} from "../../../test/platform/support";
import {
  bindBrowserDocument,
  browserCallExtension,
  BrowserCallsDoc,
  claimBrowserCall,
  failBrowserCall,
  finishBrowserCall,
} from "../../browser-call/browser-call";
import { createPetrinautBrowserToolsExtension } from "../../browser-call/petrinaut-browser-tools";
import { expectedNetRevision } from "../../net-state/net-freshness";
import {
  parseNetResultText,
  renderNetChange,
  renderPlainResult,
} from "../../net-state/visible-net-view";
import { createHostBinding, type HostBinding } from "../host-binding";
import {
  pruneEntryKind,
  pruneRequestId,
  readBackPruningExtension,
} from "./read-back-pruning";

import type { JsonValue } from "@earendil-works/chord";
import type { Message } from "@earendil-works/pi-ai";
import type { Models } from "@earendil-works/pi-ai/models";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

// ─── The net, as the scripted browser reports it ─────────────────────────────

const place = {
  id: "place-dryer",
  name: "Dryer",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};

const applied = { applied: true };
const readBackAt = (revision: string) => ({
  places: [{ id: place.id }],
  revision,
});

/** A browser's answer: a result, or a failure. */
type BrowserAnswer =
  | { readonly output: JsonValue; readonly metadata?: JsonValue }
  | { readonly fail: true };

const read = (revision: string): BrowserAnswer => ({
  output: { title: "Net" },
  metadata: { documentRevision: { before: revision } },
});
const changed = (before: string, after: string): BrowserAnswer => ({
  output: applied,
  metadata: {
    documentRevision: { before, after },
    readBack: readBackAt(after),
  },
});
const unchanged = (before: string): BrowserAnswer => ({
  output: applied,
  metadata: { documentRevision: { before } },
});
const failed: BrowserAnswer = { fail: true };

/** What the model is sent for a change with its read-back, and once pruned. */
const shown = (revision: string) =>
  renderNetChange(applied, readBackAt(revision), revision);
const pruned = renderPlainResult(applied);

// ─── Harness ─────────────────────────────────────────────────────────────────

/** An `afterTools` step around the pruning hook: recorded, and stalled on its `nth` invocation. */
type Stall = { readonly nth: number; readonly reached: () => void };

/** A hook beside the pruning one, `before` or after it, that records and can stall. */
const stallExtension = (
  name: string,
  invocations: EntryId[],
  stall: Stall | undefined,
) =>
  defineExtension({
    name,
    hooks: [
      hook(GenerationTask, {
        afterTools: async (assistant, _results, _api, hookContext) => {
          invocations.push(assistant);
          if (invocations.length !== stall?.nth) return;
          stall.reached();
          await awaitWithContext(
            new Promise<never>(() => undefined),
            hookContext,
          );
        },
      }),
    ],
  });

const stallPoint = (nth: number) => {
  let reached: () => void = () => undefined;
  const signal = new Promise<void>((resolve) => {
    reached = resolve;
  });
  return { stall: { nth, reached }, reached: signal };
};

type OpenOptions = {
  /** The binding the pruning hook reads through; the tools always get the bound one. */
  readonly hookHost?: HostBinding;
  readonly stallBefore?: Stall;
  readonly stallAfter?: Stall;
};

/**
 * A Harness with the Petrinaut browser tools, the pruning hook and its two
 * recording neighbours, over its own host binding, bound right after open.
 */
const openPruningHarness = async (
  storage: Storage,
  models: Models,
  options: OpenOptions = {},
) => {
  const host = createHostBinding();
  const reports: Report[] = [];
  const hookRuns: EntryId[] = [];
  const afterPrune: EntryId[] = [];
  const extensions = [
    createPetrinautBrowserToolsExtension(host),
    stallExtension("test.before-prune", hookRuns, options.stallBefore),
    readBackPruningExtension(options.hookHost ?? host),
    stallExtension("test.after-prune", afterPrune, options.stallAfter),
  ];
  const registry = createRegistry();
  registry.install(browserCallExtension);
  for (const extension of extensions) registry.install(extension);
  const harness = await Harness.open(
    storage,
    { models, registry, onReport: (report) => reports.push(report) },
    context,
  );
  host.bind(harness);
  return { harness, extensions, reports, hookRuns };
};

type Opened = Awaited<ReturnType<typeof openPruningHarness>>;

/** A conversation over `opened`, bound to an editor. */
const createRoot = async (
  { harness, extensions }: Opened,
  model: ReturnType<typeof recordingModel>["model"],
) => {
  const root = await harness.root(context, { agent: { model, extensions } });
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

/** The browser's side: claim the issued call and answer it. */
const answer = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  browser: BrowserAnswer,
) => {
  await vi.waitFor(async () => {
    const records = (
      await harness.snapshot(BrowserCallsDoc, conversationId, context)
    )?.calls;
    expect(records?.[toolCallId]?.status).toBe("pending");
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
  if ("fail" in browser)
    await failBrowserCall(
      harness,
      { ...proof, disposition: "failed" },
      context,
    );
  else
    await finishBrowserCall(
      harness,
      { ...proof, output: browser.output, metadata: browser.metadata },
      context,
    );
};

/** Answer each `[toolCallId, answer]` in turn, once it is issued. */
const browse = async (
  harness: Harness,
  conversationId: ConversationId,
  answers: readonly (readonly [string, BrowserAnswer])[],
) => {
  for (const [toolCallId, browser] of answers)
    // eslint-disable-next-line no-await-in-loop -- The browser answers one call at a time.
    await answer(harness, conversationId, toolCallId, browser);
};

const addPlace = (id: string) => ["addPlace", id, place] as const;
const readNet = (id: string) => ["readNetOutline", id, {}] as const;

/** Each tool result's model-facing text in `messages`, by call ID. */
const resultTexts = (messages: readonly Message[]) =>
  Object.fromEntries(
    messages.flatMap((message) =>
      message.role === "toolResult"
        ? [[message.toolCallId, textOf(message)]]
        : [],
    ),
  );

/** The successful results in `messages` that show a read-back, by call ID, in order. */
const shownReadBacks = (messages: readonly Message[]) =>
  messages.flatMap((message) => {
    if (message.role !== "toolResult" || message.isError) return [];
    const parsed = parseNetResultText(textOf(message));
    return parsed !== undefined && "netAfterChanges" in parsed
      ? [message.toolCallId]
      : [];
  });

const pruneEntries = async (conversation: Conversation) =>
  (await allEntries(conversation)).filter(
    ({ kind }) => kind === pruneEntryKind,
  );

/** The rounds before each case: read r0 at R0, then change c0 to R1 with its read-back. */
const earlierRounds: FauxResponseStep[] = [
  calls(readNet("r0")),
  calls(addPlace("c0")),
];
const earlierAnswers = [
  ["r0", read("R0")],
  ["c0", changed("R0", "R1")],
] as const;

/** One input over memory: the earlier rounds, `round`, then an answer; the browser answers `answers`. */
const scenario = async (
  round: FauxResponseStep,
  answers: readonly (readonly [string, BrowserAnswer])[],
  options: OpenOptions = {},
) => {
  const { models, model, requests } = recordingModel([
    ...earlierRounds,
    round,
    fauxAssistantMessage("done"),
  ]);
  const opened = await openPruningHarness(new MemoryStorage(), models, options);
  const root = await createRoot(opened, model);
  const input = await root.submit({ type: "input", content: "go" }, context);
  await browse(opened.harness, root.id, [...earlierAnswers, ...answers]);
  expect((await input.wait(context)).status).toBe("done");
  return { ...opened, root, requests };
};

// ─── Outcome-aware selection ─────────────────────────────────────────────────

describe("outcome-aware pruning after a round", () => {
  test("c1 ok + c2 ok: only c2 keeps its read-back; c1 and the earlier c0 are pruned by one write after the round; raw results unchanged", async () => {
    const { harness, root, requests } = await scenario(
      calls(addPlace("c1"), addPlace("c2")),
      [
        ["c1", changed("R1", "R2")],
        ["c2", changed("R2", "R3")],
      ],
    );
    try {
      const entries = await allEntries(root);
      // The earlier rounds had nothing to prune: one write, after the case round's results.
      expect(kindsOf(entries)).toEqual([
        "pi.user",
        "pi.system",
        "pi.assistant(r0)",
        "pi.tool-result(r0)",
        "pi.assistant(c0)",
        "pi.tool-result(c0)",
        "pi.assistant(c1,c2)",
        "pi.tool-result(c1)",
        "pi.tool-result(c2)",
        pruneEntryKind,
        "pi.assistant",
      ]);
      const assistant = entries.find(
        ({ kind, model }) =>
          kind === "pi.assistant" &&
          model?.[0]?.role === "assistant" &&
          model[0].content.some(
            (part) => part.type === "toolCall" && part.id === "c1",
          ),
      )!.id;
      const [prune] = await pruneEntries(root);
      expect(prune?.data).toEqual({ assistant });
      expect(
        await harness.commit(
          (tx) => tx.submissionByRequest(root.id, pruneRequestId(assistant)),
          context,
        ),
      ).toMatchObject({ requestId: `brunch.prune:${assistant}` });
      expect(shownReadBacks(requests[2]!)).toEqual(["c0"]);
      const last = requests.at(-1)!;
      expect(shownReadBacks(last)).toEqual(["c2"]);
      expect(resultTexts(last)).toMatchObject({
        c0: pruned,
        c1: pruned,
        c2: shown("R3"),
      });
      // The request equals the committed context, through the pruning write.
      expect(last).toEqual(
        (await root.context(context, { at: prune!.id })).messages,
      );
      expect(expectedNetRevision(await root.context(context))).toEqual({
        revision: "R3",
      });
      for (const [id, revision] of [
        ["c0", "R1"],
        ["c1", "R2"],
        ["c2", "R3"],
      ] as const)
        expect(textOf(resultEntry(entries, id)?.model?.[0])).toBe(
          shown(revision),
        );
    } finally {
      await harness.close(context);
    }
  });

  test("c1 ok + c2 failed: c1 keeps its read-back, c0 is pruned; freshness is c1's", async () => {
    const { harness, root, requests } = await scenario(
      calls(addPlace("c1"), addPlace("c2")),
      [
        ["c1", changed("R1", "R2")],
        ["c2", failed],
      ],
    );
    try {
      const last = requests.at(-1)!;
      expect(shownReadBacks(last)).toEqual(["c1"]);
      expect(resultTexts(last).c0).toBe(pruned);
      expect(
        last.find((m) => m.role === "toolResult" && m.toolCallId === "c2"),
      ).toMatchObject({ isError: true });
      expect(expectedNetRevision(await root.context(context))).toEqual({
        revision: "R2",
      });
    } finally {
      await harness.close(context);
    }
  });

  test("c1 ok + c2 unchanged (no after): c1 keeps its read-back, c0 is pruned", async () => {
    const { harness, root, requests } = await scenario(
      calls(addPlace("c1"), addPlace("c2")),
      [
        ["c1", changed("R1", "R2")],
        ["c2", unchanged("R2")],
      ],
    );
    try {
      const last = requests.at(-1)!;
      expect(shownReadBacks(last)).toEqual(["c1"]);
      expect(resultTexts(last)).toMatchObject({ c0: pruned, c2: pruned });
      expect(expectedNetRevision(await root.context(context))).toEqual({
        revision: "R2",
      });
    } finally {
      await harness.close(context);
    }
  });

  test("a read after a change in the same round: the read is the view; c1 and c0 lose their read-backs", async () => {
    const { harness, root, requests } = await scenario(
      calls(addPlace("c1"), readNet("r2")),
      [
        ["c1", changed("R1", "R2")],
        ["r2", read("R2")],
      ],
    );
    try {
      const last = requests.at(-1)!;
      expect(shownReadBacks(last)).toEqual([]);
      expect(resultTexts(last)).toMatchObject({ c0: pruned, c1: pruned });
      expect(expectedNetRevision(await root.context(context))).toEqual({
        revision: "R2",
      });
    } finally {
      await harness.close(context);
    }
  });

  test("a round whose only change failed prunes nothing and writes nothing", async () => {
    const { harness, root, requests } = await scenario(calls(addPlace("c1")), [
      ["c1", failed],
    ]);
    try {
      expect(await pruneEntries(root)).toEqual([]);
      expect(shownReadBacks(requests.at(-1)!)).toEqual(["c0"]);
      expect(expectedNetRevision(await root.context(context))).toEqual({
        revision: "R1",
      });
    } finally {
      await harness.close(context);
    }
  });
});

// ─── Call order ──────────────────────────────────────────────────────────────

describe("call order", () => {
  test("results completing out of call order are judged in call order: c2 settles first, w1 last, and w1's read-back is pruned", async () => {
    const { harness, root, requests } = await scenario(
      calls(addPlace("w1"), addPlace("c2")),
      [
        ["c2", changed("R1", "R3")],
        ["w1", changed("R1", "R2")],
      ],
    );
    try {
      const entries = await allEntries(root);
      // c2's result committed first.
      expect(resultEntry(entries, "c2")!.id).toBeLessThan(
        resultEntry(entries, "w1")!.id,
      );
      const last = requests.at(-1)!;
      expect(shownReadBacks(last)).toEqual(["c2"]);
      expect(resultTexts(last)).toMatchObject({ c0: pruned, w1: pruned });
      expect(expectedNetRevision(await root.context(context))).toEqual({
        revision: "R3",
      });
    } finally {
      await harness.close(context);
    }
  });
});

// ─── Fail-safe ───────────────────────────────────────────────────────────────

describe("fail-safe: an extra read-back, never none", () => {
  const extensionErrors = (reports: readonly Report[]) =>
    reports
      .filter(({ kind }) => kind === "extension_error")
      .map(({ error }) => (error instanceof Error ? error.message : error));

  test("a throwing hook is reported, the run goes on, and the model sees every read-back", async () => {
    const throwing: HostBinding = {
      bind: () => undefined,
      conversation: async () => {
        throw new Error("The host failed.");
      },
    };
    const { harness, root, requests, reports } = await scenario(
      calls(addPlace("c1")),
      [["c1", changed("R1", "R2")]],
      { hookHost: throwing },
    );
    try {
      // One report per round.
      expect(extensionErrors(reports)).toEqual([
        "The host failed.",
        "The host failed.",
        "The host failed.",
      ]);
      expect(await pruneEntries(root)).toEqual([]);
      expect(shownReadBacks(requests.at(-1)!)).toEqual(["c0", "c1"]);
      expect(expectedNetRevision(await root.context(context))).toEqual({
        revision: "R2",
      });
    } finally {
      await harness.close(context);
    }
  });

  test("an unbound hook is reported as such, and nothing is pruned", async () => {
    const { harness, root, requests, reports } = await scenario(
      calls(addPlace("c1")),
      [["c1", changed("R1", "R2")]],
      { hookHost: createHostBinding() },
    );
    try {
      expect(new Set(extensionErrors(reports))).toEqual(
        new Set(["Host is not bound."]),
      );
      expect(await pruneEntries(root)).toEqual([]);
      expect(shownReadBacks(requests.at(-1)!)).toEqual(["c0", "c1"]);
    } finally {
      await harness.close(context);
    }
  });
});

// ─── Abort ───────────────────────────────────────────────────────────────────

describe("abort", () => {
  test("abort while a real browser change waits: no pruning that round, the aborted change is no view, and the next round with tools prunes", async () => {
    const { models, model, requests } = recordingModel([
      ...earlierRounds,
      calls(addPlace("c1"), addPlace("w")),
      // The next input's run.
      calls(addPlace("c3")),
      fauxAssistantMessage("done"),
    ]);
    const opened = await openPruningHarness(new MemoryStorage(), models);
    const { harness, hookRuns } = opened;
    try {
      const root = await createRoot(opened, model);
      const input = await root.submit(
        { type: "input", content: "go" },
        context,
      );
      await browse(harness, root.id, [
        ...earlierAnswers,
        ["c1", changed("R1", "R2")],
      ]);
      await vi.waitFor(async () => {
        expect(resultEntry(await allEntries(root), "c1")).toBeDefined();
        const records = (
          await harness.snapshot(BrowserCallsDoc, root.id, context)
        )?.calls;
        expect(records?.w?.status).toBe("pending");
      });
      await root.abort(context);
      expect((await input.wait(context)).status).toBe("unanswered");
      // Only the earlier rounds' hooks ran.
      expect(hookRuns).toHaveLength(2);
      expect(await pruneEntries(root)).toEqual([]);
      const aborted = await root.context(context);
      expect(shownReadBacks(aborted.messages)).toEqual(["c0", "c1"]);
      expect(
        aborted.messages.find(
          (m) => m.role === "toolResult" && m.toolCallId === "w",
        ),
      ).toMatchObject({ isError: true });
      expect(expectedNetRevision(aborted)).toEqual({ revision: "R2" });

      const next = await root.submit(
        { type: "input", content: "next" },
        context,
      );
      await answer(harness, root.id, "c3", changed("R2", "R3"));
      expect((await next.wait(context)).status).toBe("done");
      // The next run's first request: both read-backs, never none.
      expect(shownReadBacks(requests.at(-2)!)).toEqual(["c0", "c1"]);
      expect(
        (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls.c3
          ?.expectedRevision,
      ).toBe("R2");
      // Its round's hook prunes from the whole effective context.
      expect(shownReadBacks(requests.at(-1)!)).toEqual(["c3"]);
      expect(await pruneEntries(root)).toHaveLength(1);
    } finally {
      await harness.close(context);
    }
  });
});

// ─── Replay and restart ──────────────────────────────────────────────────────

describe("replay and restart over SQLite, with a fresh binding", () => {
  let directory: string;
  let file: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "durable-read-back-pruning-"));
    file = join(directory, "session.sqlite");
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  /** Run to a stall in the case round's hooks, close, and reopen over the same file. */
  const restartAt = async (where: "before" | "after") => {
    const { models, model, requests } = recordingModel([
      ...earlierRounds,
      calls(addPlace("c1")),
      fauxAssistantMessage("done"),
    ]);
    // The case round's hooks are the third invocation.
    const { stall, reached } = stallPoint(3);
    const first = await openPruningHarness(
      await openNodeSqliteStorage(file),
      models,
      where === "before" ? { stallBefore: stall } : { stallAfter: stall },
    );
    const root = await createRoot(first, model);
    const input = await root.submit({ type: "input", content: "go" }, context);
    await browse(first.harness, root.id, [
      ...earlierAnswers,
      ["c1", changed("R1", "R2")],
    ]);
    await reached;
    const assistant = first.hookRuns[2]!;
    const admitted = await first.harness.commit(
      (tx) => tx.submissionByRequest(root.id, pruneRequestId(assistant)),
      context,
    );
    const expectedRevision = (
      await first.harness.snapshot(BrowserCallsDoc, root.id, context)
    )?.calls.c1?.expectedRevision;
    expect(await pruneEntries(root)).toEqual([]);
    await first.harness.close(context);

    const second = await openPruningHarness(
      await openNodeSqliteStorage(file),
      models,
    );
    const recovered = await second.harness.submission(input.id, context);
    expect((await recovered!.wait(context)).status).toBe("done");
    const resumed = (await second.harness.conversation(root.id, context))!;
    return {
      second,
      resumed,
      requests,
      assistant,
      admitted,
      expectedRevision,
    };
  };

  test("stopped after the round is terminal, before the hook's write: the hook reruns for the same round, the write lands once, and the run answers", async () => {
    const { second, resumed, requests, assistant, admitted, expectedRevision } =
      await restartAt("before");
    try {
      expect(admitted).toBeUndefined();
      expect(expectedRevision).toBe("R1");
      // The new Harness's hooks ran for the interrupted round.
      expect(second.hookRuns).toEqual([assistant]);
      const prunes = await pruneEntries(resumed);
      expect(prunes).toHaveLength(1);
      expect(prunes[0]?.data).toEqual({ assistant });
      // The tools phase reran, not the model request.
      expect(requests).toHaveLength(4);
      expect(shownReadBacks(requests[3]!)).toEqual(["c1"]);
      // The tool's rerun kept its record's first decision.
      expect(
        (await second.harness.snapshot(BrowserCallsDoc, resumed.id, context))
          ?.calls.c1?.expectedRevision,
      ).toBe(expectedRevision);
      expect(
        second.reports.filter(({ kind }) => kind === "extension_error"),
      ).toEqual([]);
    } finally {
      await second.harness.close(context);
    }
  });

  test("stopped after the write was admitted, before the boundary placed it: the rerun hook gets the same submission, one entry", async () => {
    const { second, resumed, requests, assistant, admitted } =
      await restartAt("after");
    try {
      expect(admitted?.requestId).toBe(pruneRequestId(assistant));
      expect(second.hookRuns).toEqual([assistant]);
      const prunes = await pruneEntries(resumed);
      expect(prunes).toHaveLength(1);
      expect(
        await second.harness.commit(
          (tx) => tx.submissionByRequest(resumed.id, pruneRequestId(assistant)),
          context,
        ),
      ).toMatchObject({ id: admitted?.id });
      expect(requests).toHaveLength(4);
      expect(shownReadBacks(requests[3]!)).toEqual(["c1"]);
    } finally {
      await second.harness.close(context);
    }
  });
});
