/**
 * Scaffolding for the compaction-placement probes: where can the model's last
 * visible net view live so that it survives native compaction?
 *
 * - A scripted faux model that tells summarization requests (answered with a
 *   native-style summary that never carries a net view) from conversation
 *   requests (recorded, answered from a queue).
 * - Stand-in net tools: `readNet` shows the net in its `content`; `failNet`
 *   errs with a newer revision in `details` only, so it is never visible.
 * - A hand-edit notice: a host write with a user `model` message.
 * - `lastVisibleView`: the probe-local derivation of the model's last visible
 *   net view from `ContextView.messages`, in order, with hand-edit
 *   invalidation. It is a probe, not the product derivation.
 * - The `net_view` section (candidate A) in two variants: the prefix state
 *   read from the pre-compaction context, or from a document a `beforeCompact`
 *   hook writes.
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
  CompactionTask,
  type ContextView,
  type Conversation,
  type ConversationId,
  createRegistry,
  defineDoc,
  defineExtension,
  defineTool,
  type EntryId,
  type Extension,
  Harness,
  hook,
  MemoryStorage,
  type ModelRef,
  type PromptSection,
  section,
  SystemEntry,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";

import { context, textOf } from "../support";

import type { Context } from "@earendil-works/chord";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";

export { context };

// ---------------------------------------------------------------------------
// The net, its views and the probe derivation.

export type NetState = { revision: string; structure: string };

/** What the model's context says about the net. */
export type ViewState =
  | { kind: "view"; revision: string; structure: string }
  | { kind: "stale"; revision: string };

/** A net representation as the model sees it. */
export const netText = ({ revision, structure }: NetState) =>
  `<net revision="${revision}">${structure}</net>`;

const netPattern = /<net revision="([^"]+)">([\s\S]*?)<\/net>/u;
const handEditPattern = /<hand-edit revision="([^"]+)"\s*\/>/u;

/** The prefix a host-authored restore entry (candidate B) starts with. */
export const restorePrefix =
  "Before the conversation was summarized, you last saw the net as:\n";

/** The `net_view` section's text, before Pi wraps it in its tag. */
export const sectionText = (view: NetState) =>
  `Before the conversation was summarized, you last saw the net as:\n${netText(view)}`;

export const sectionKey = "net_view";

const parseNet = (text: string): NetState | undefined => {
  const match = netPattern.exec(text);
  return match === null
    ? undefined
    : { revision: match[1]!, structure: match[2]! };
};

/**
 * The net event a message carries, if any. Only `content` counts, never
 * `details`: Pi sends the model a tool result's content.
 *
 * - A successful `readNet` result whose content shows the net: a view.
 * - A user message starting with `restorePrefix` (candidate B): a view. A
 *   summary starts with Pi's own prefix, so a summarizer that copies a net
 *   marker is not credited.
 * - A system message whose `net_view` section shows the net (candidate A): a
 *   view. A `null` patch removes a section; it is no event.
 * - A user message carrying a hand-edit notice: stale.
 */
export const netEvent = (message: Message): ViewState | undefined => {
  if (message.role === "toolResult") {
    if (message.toolName !== "readNet" || message.isError) return undefined;
    const net = parseNet(textOf(message));
    return net && { kind: "view", ...net };
  }
  if (message.role === "system") {
    const text = message.sections?.[sectionKey];
    const net = typeof text === "string" ? parseNet(text) : undefined;
    return net && { kind: "view", ...net };
  }
  if (message.role === "user") {
    const text = textOf(message);
    const edit = handEditPattern.exec(text);
    if (edit !== null) return { kind: "stale", revision: edit[1]! };
    if (!text.startsWith(restorePrefix)) return undefined;
    const net = parseNet(text);
    return net && { kind: "view", ...net };
  }
  return undefined;
};

/**
 * The model's last visible net view: fold the messages in order, from
 * `initial`. A hand-edit notice after a view makes it stale; a later view
 * makes it current again.
 */
export const lastVisibleView = (
  messages: readonly Message[],
  initial?: ViewState,
): ViewState | undefined => {
  let state = initial;
  for (const message of messages) state = netEvent(message) ?? state;
  return state;
};

/** Whether the messages hold a `net_view` section (candidate A). */
const isSectionMessage = (message: Message) =>
  message.role === "system" && message.sections?.[sectionKey] !== undefined;

// ---------------------------------------------------------------------------
// The scripted faux model.

const summarizerPrompt = "You are a context summarization assistant.";

/** Whether a faux request is native compaction's summarization request. */
const isSummarization = (messages: readonly Message[]) => {
  const first = messages[0];
  return (
    first?.role === "system" &&
    typeof first.content === "string" &&
    first.content.startsWith(summarizerPrompt)
  );
};

type Step = FauxResponseStep;

/**
 * A faux model. Conversation requests are recorded and answered from
 * `queue`; summarization requests are recorded apart and answered by
 * `summarize` (default: a summary with no net view).
 */
export const scriptedModel = (options?: { contextWindow?: number }) => {
  const requests: Message[][] = [];
  const summaries: Message[][] = [];
  const queue: FauxResponseStep[] = [];
  const control: {
    summarize: () => AssistantMessage | Promise<AssistantMessage>;
  } = {
    summarize: () => fauxAssistantMessage("## Goal\nModel a laundry."),
  };
  const faux = fauxProvider({
    models: [
      {
        id: "probe",
        contextWindow: options?.contextWindow ?? 128_000,
        maxTokens: 4096,
      },
    ],
  });
  const respond: FauxResponseFactory = async (requestContext, ...rest) => {
    const messages = structuredClone(requestContext.messages);
    if (isSummarization(messages)) {
      summaries.push(messages);
      return control.summarize();
    }
    requests.push(messages);
    const step = queue.shift();
    if (step === undefined) throw new Error("The probe's queue is empty.");
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
    script: (...steps: Step[]) => {
      queue.push(...steps);
    },
  };
};

// ---------------------------------------------------------------------------
// Stand-in net tools and the hand-edit notice.

/** The browser's net; tests move it. */
export type Browser = { current: NetState };

export const netTools = (browser: Browser) => [
  defineTool({
    name: "readNet",
    description: "Read the net.",
    parameters: obj({}),
    execute: async () => ({
      output: [{ type: "text", text: netText(browser.current) }],
      details: { revision: browser.current.revision },
    }),
  }),
  // The browser applied something but the call failed: the newer revision is
  // only in `details`, which Pi never sends to the model.
  defineTool({
    name: "failNet",
    description: "Change the net (fails).",
    parameters: obj({}),
    execute: async () => ({
      output: [{ type: "text", text: "The browser did not confirm." }],
      details: { revision: browser.current.revision },
      isError: true,
    }),
  }),
];

/** Admit a hand-edit notice as a host write. */
export const handEdit = (root: Conversation, revision: string) =>
  root.submit(
    {
      type: "write",
      requestId: `hand-edit:${revision}`,
      entry: {
        kind: "probe.hand-edit",
        data: { revision },
        model: [
          {
            role: "user",
            content: `The user edited the net by hand. <hand-edit revision="${revision}"/>`,
            timestamp: 0,
          },
        ],
      },
    },
    context,
  );

// ---------------------------------------------------------------------------
// Candidate A: the `net_view` section.

/** A late-bound Harness, so closures survive reopening. */
export type HarnessRef = { current?: Harness };

/** Work the candidate-A section and hook did. */
export const createCounters = () => {
  const values = { renders: 0, contextReads: 0, hookCalls: 0 };
  return {
    values,
    bump: (key: keyof typeof values) => {
      values[key] += 1;
    },
  };
};

export type Counters = ReturnType<typeof createCounters>;

const conversationOf = async (
  ref: HarnessRef,
  id: ConversationId,
  ctx: Context,
): Promise<Conversation> => {
  const conversation = await ref.current?.conversation(id, ctx);
  if (conversation === undefined) throw new Error("No conversation.");
  return conversation;
};

/** The newest entry before `id`. */
const entryBefore = async (
  conversation: Conversation,
  id: EntryId,
  ctx: Context,
): Promise<EntryId | undefined> =>
  (
    await conversation.entries(
      { maxEntryId: (id - 1) as EntryId, order: "descending" },
      1,
      undefined,
      ctx,
    )
  ).items[0]?.id;

/**
 * Whether the context after its compaction head shows a net event that
 * decides the view by itself. Only messages of entries before the first
 * `pi.system` entry after the head count: that entry is the baseline Pi
 * writes after every head, which carries this section's own rendering. So
 * the decision, made at the first request after the compaction, stays the
 * same until the next one (no section churn), and a later view or notice
 * follows the restored one in the context, as it should.
 */
export const tailDecides = (view: ContextView): boolean => {
  const head = view.head!;
  const baseline = view.entries.find(
    (entry) => entry.id > head.id && SystemEntry.is(entry),
  );
  return view.entries.some(
    (entry, index) =>
      entry.id !== head.id &&
      (baseline === undefined || entry.id < baseline.id) &&
      view.contributions[index]!.some(
        (message) =>
          !isSectionMessage(message) && netEvent(message) !== undefined,
      ),
  );
};

/** How the section learns the view at the end of the summarized prefix. */
export type PrefixSource =
  /** Derive it from the pre-compaction context through the Harness. */
  | { kind: "context" }
  /** Read it from the document a `beforeCompact` hook wrote. */
  | { kind: "document" }
  /**
   * Read only the document: no context read, so no head and no tail check.
   * The newest prefix state the hook wrote is rendered whenever there is one.
   */
  | { kind: "documentOnly" };

/** The state at the end of each summarized prefix, by its `firstKept`. */
export const PrefixViewDoc = defineDoc<{
  byFirstKept: Record<string, ViewState | null>;
  latest: string | null;
}>({
  kind: "probe.prefix-view",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ byFirstKept: {}, latest: null }),
  checkpointWhen: () => false,
});

/**
 * The state at the end of the summarized prefix, from the pre-compaction
 * context: the context as of the newest entry before the compaction head.
 * Its own `net_view` sections count, so a restored view survives a second
 * compaction.
 */
export const prefixFromContext = async (
  conversation: Conversation,
  head: EntryId,
  ctx: Context,
): Promise<ViewState | undefined> => {
  const before = await entryBefore(conversation, head, ctx);
  if (before === undefined) return undefined;
  const view = await conversation.context(ctx, { at: before });
  return lastVisibleView(view.messages);
};

/** The `net_view` section (candidate A). */
export const netViewSection = (
  ref: HarnessRef,
  source: PrefixSource,
  counters: Counters,
): PromptSection =>
  section(sectionKey, async (input, ctx) => {
    counters.bump("renders");
    if (source.kind === "documentOnly") {
      const doc = await input.read.snapshot(
        PrefixViewDoc,
        input.conversationId,
        ctx,
      );
      const state =
        doc?.latest === null || doc === undefined
          ? undefined
          : doc.byFirstKept[doc.latest];
      return state?.kind === "view" ? sectionText(state) : undefined;
    }
    const conversation = await conversationOf(ref, input.conversationId, ctx);
    const view = await conversation.context(ctx);
    counters.bump("contextReads");
    const head = view.head;
    if (!CompactionEntry.is(head) || tailDecides(view)) return undefined;
    let state: ViewState | undefined;
    if (source.kind === "context") {
      state = await prefixFromContext(conversation, head.id, ctx);
      counters.bump("contextReads");
    } else {
      const doc = await input.read.snapshot(
        PrefixViewDoc,
        input.conversationId,
        ctx,
      );
      state = doc?.byFirstKept[String(head.head)] ?? undefined;
    }
    return state?.kind === "view" ? sectionText(state) : undefined;
  });

/**
 * The `beforeCompact` hook of the document variant: fold the summarized
 * messages, from the state an earlier compaction head stood for, and write
 * the result through the Harness the host closes over. `HookApi` is read-only;
 * the hook returns nothing, so Pi's own summarizer runs.
 */
export const prefixViewHook = (ref: HarnessRef, counters: Counters) =>
  hook(CompactionTask, {
    beforeCompact: async (compaction, api, ctx) => {
      counters.bump("hookCalls");
      const [first] = compaction.entries;
      const doc = await api.snapshot(PrefixViewDoc, api.conversationId, ctx);
      const initial = CompactionEntry.is(first)
        ? (doc?.byFirstKept[String(first.head)] ?? undefined)
        : undefined;
      const state = lastVisibleView(compaction.messages, initial) ?? null;
      const harness = ref.current;
      if (harness === undefined) throw new Error("No harness.");
      await harness.commit(async (tx) => {
        const doc = await tx.doc(PrefixViewDoc, api.conversationId);
        doc.byFirstKept[String(compaction.firstKept)] = state;
        doc.latest = String(compaction.firstKept);
      }, ctx);
      return undefined;
    },
  });

// ---------------------------------------------------------------------------
// The harness.

/** Storage that survives `Harness.close()`, so a new Harness can reopen it. */
export class RetainedStorage extends MemoryStorage {
  override async close() {
    // Kept open for the next Harness; a probe, not a process kill.
  }
}

export type Probe = Awaited<ReturnType<typeof openProbe>>;

/**
 * A Harness over `storage` with the net tools and `extensions`. Compaction is
 * off until `compaction` enables it; settings are read at each use.
 */
export const openProbe = async (options: {
  browser: Browser;
  extensions?: (ref: HarnessRef) => Extension[];
  storage?: MemoryStorage;
  contextWindow?: number;
  model?: ReturnType<typeof scriptedModel>;
}) => {
  const model =
    options.model ?? scriptedModel({ contextWindow: options.contextWindow });
  const ref: HarnessRef = {};
  const compaction: CompactionPolicy = {
    enabled: false,
    keepRecentTokens: 1,
    reserveTokens: 16_384,
    backgroundTokens: 0,
  };
  const registry = createRegistry();
  registry.install(
    defineExtension({ name: "probe.net", tools: netTools(options.browser) }),
  );
  for (const extension of options.extensions?.(ref) ?? [])
    registry.install(extension);
  const reports: unknown[] = [];
  const storage = options.storage ?? new RetainedStorage();
  const harness = await Harness.open(
    storage,
    {
      models: model.models,
      registry,
      settings: () => ({ compaction }),
      onReport: (report) => {
        reports.push(report);
      },
    },
    context,
  );
  ref.current = harness;
  const root = await harness.root(context, { agent: { model: model.model } });
  const ask = async (content: string) =>
    (await root.submit({ type: "input", content }, context)).wait(context);
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
    reports,
    ask,
    compact,
    close: () => harness.close(context),
  };
};

/** Extensions for candidate A, in either variant. */
export const sectionExtensions =
  (source: PrefixSource, counters: Counters = createCounters()) =>
  (ref: HarnessRef): Extension[] => [
    defineExtension({
      name: "probe.net-view-section",
      sections: [netViewSection(ref, source, counters)],
      hooks: source.kind === "context" ? [] : [prefixViewHook(ref, counters)],
    }),
  ];

// ---------------------------------------------------------------------------
// Request checks.

/**
 * The committed effective context a request was prepared from: the context
 * as of the newest entry before the assistant entry that answered it.
 */
export const committedContextBefore = async (
  root: Conversation,
  answer: EntryId,
): Promise<readonly Message[]> => {
  const before = await entryBefore(root, answer, context);
  if (before === undefined) throw new Error("No entry before the answer.");
  return (await root.context(context, { at: before })).messages;
};

/** The first assistant entry after `after`. */
export const firstAnswerAfter = async (
  root: Conversation,
  after: EntryId,
): Promise<EntryId> => {
  const page = await root.entries(
    { minEntryId: (after + 1) as EntryId, order: "ascending" },
    100,
    undefined,
    context,
  );
  const answer = page.items.find((entry) => entry.kind === "pi.assistant");
  if (answer === undefined) throw new Error("No answer after the entry.");
  return answer.id;
};

/** The current context's compaction head. */
export const compactionHead = async (root: Conversation) => {
  const { head } = await root.context(context);
  if (!CompactionEntry.is(head)) throw new Error("No compaction head.");
  return head;
};

/** A long answer, to push a cut where a test wants it. */
export const filler = (label: string) =>
  `${label} ${"The laundry runs on a schedule. ".repeat(120)}`;
