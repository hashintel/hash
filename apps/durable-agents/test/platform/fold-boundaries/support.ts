/**
 * Probe-local stand-ins for the fold redesign's two new mechanisms, shared by
 * the U0 boundary probes (`test/platform/fold-boundaries/**` and
 * `test/integration/fold-boundaries/**`):
 *
 * - the renderings of "Model-facing renderings": a read renders
 *   `{"output","netRevision"}`, a change `{"output","netAfterChanges","netRevision"}`,
 *   a pruned change its bare `JSON.stringify(output)`;
 * - `visibleNetView`, the design's one derivation, over `ContextView.messages`;
 * - `pruneEdits` and an `afterTools` hook admitting them as one `brunch.prune`
 *   write per round, through a per-Harness host binding;
 * - the `net_view` prompt section ("context" variant), through the same binding;
 * - a scripted faux model that answers summarization apart from conversation
 *   requests.
 *
 * Nothing here is product code: U1, U4 and U5 build the real ones. These follow
 * the design's contracts closely enough that a boundary failure here would be
 * one there.
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
  type ContextEdit,
  type ContextView,
  type Conversation,
  type ConversationId,
  createRegistry,
  defineExtension,
  defineTool,
  type EntryId,
  type EntryRecord,
  type Extension,
  GenerationTask,
  Harness,
  hook,
  type ModelRef,
  type PromptSection,
  type Report,
  section,
  type Storage,
  type SubmissionId,
  SystemEntry,
} from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";

import { context } from "../support";

import type { Context } from "@earendil-works/chord";
import type {
  AssistantMessage,
  Message,
  ToolResultMessage,
} from "@earendil-works/pi-ai";

export { context };

// ─── Renderings ──────────────────────────────────────────────────────────────

export const pruneKind = "brunch.prune";
export const handEditKind = "brunch.hand-edit";
export const sectionKey = "net_view";

/** Tools whose results may show the net (`mayShowNet`). */
const netTools = new Set(["readNet", "change"]);

/** A net's structure at `revision`, grown by `padding`, ending with a sentinel. */
export const netAt = (revision: string, padding = 0) => ({
  revision,
  places: [{ id: "place-dryer", name: "Dryer" }],
  padding: "x".repeat(padding),
  last: "END OF NET",
});

export const renderRead = (output: unknown, revision: string) =>
  JSON.stringify({ output, netRevision: revision });

export const renderChange = (
  output: unknown,
  readBack: unknown,
  revision: string,
) =>
  JSON.stringify({ output, netAfterChanges: readBack, netRevision: revision });

/** The section's text before Pi wraps it in its tag. */
export const sectionText = (revision: string, body: string) =>
  `Before the conversation was summarized, you last saw the net as:\n<net-view revision="${revision}">${body}</net-view>`;

export const noteText = (revision: string) =>
  `<hand-edit revision="${revision}">The user changed the net in the editor; it is now at revision ${revision}. A net view of yours at another revision is out of date: read the net before changing it.</hand-edit>`;

const sectionPattern = /<net-view revision="([^"]+)">([\s\S]*)<\/net-view>/u;
const notePattern = /<hand-edit revision="([^"]+)">/u;

const textParts = (message: ToolResultMessage) =>
  message.content.flatMap((part) => (part.type === "text" ? [part.text] : []));

type ToolView = {
  readonly kind: "read" | "read-back";
  readonly revision: string;
  /** What a section restoring this view shows. */
  readonly body: string;
  readonly output: unknown;
};

/** The complete net view a tool result shows, by the design's rule 2. */
export const toolView = (message: Message): ToolView | undefined => {
  if (message.role !== "toolResult" || message.isError) return undefined;
  if (!netTools.has(message.toolName)) return undefined;
  const parts = textParts(message);
  if (parts.some((text) => text.includes("Output truncated"))) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(parts[0] ?? "");
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || !("output" in parsed))
    return undefined;
  const { netRevision, netAfterChanges, output } = parsed as {
    netRevision?: unknown;
    netAfterChanges?: unknown;
    output: unknown;
  };
  if (typeof netRevision !== "string") return undefined;
  if (message.toolName === "change")
    return netAfterChanges === undefined
      ? undefined
      : {
          kind: "read-back",
          revision: netRevision,
          body: JSON.stringify(netAfterChanges),
          output,
        };
  return {
    kind: "read",
    revision: netRevision,
    body: JSON.stringify(output),
    output,
  };
};

/** The view a `net_view` system section shows. */
const sectionView = (message: Message) => {
  if (message.role !== "system") return undefined;
  const text = message.sections?.[sectionKey];
  if (typeof text !== "string") return undefined;
  const match = sectionPattern.exec(text);
  return match === null ? undefined : { revision: match[1]!, body: match[2]! };
};

const noteRevision = (message: Message, entry: EntryRecord | undefined) => {
  if (entry?.kind !== handEditKind || message.role !== "user") return undefined;
  const text =
    typeof message.content === "string"
      ? message.content
      : message.content
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("");
  return notePattern.exec(text)?.[1];
};

// ─── The derivation ──────────────────────────────────────────────────────────

export type VisibleNetView =
  | { readonly state: "none" }
  | {
      readonly state: "stale";
      readonly seen: string;
      readonly edited: string;
      readonly message: Message;
    }
  | {
      readonly state: "current";
      readonly revision: string;
      readonly kind: "read" | "read-back" | "section";
      readonly body: string;
      readonly message: Message;
    };

/** The entry each message of `view.messages` came from, by object identity. */
const entryOf = (view: ContextView) => {
  const byMessage = new Map<Message, EntryRecord>();
  view.contributions.forEach((messages, index) => {
    const entry = view.entries[index];
    if (entry !== undefined)
      for (const message of messages) byMessage.set(message, entry);
  });
  return byMessage;
};

/** `visibleNetView` over a request's messages alone, given the note entries' messages. */
export const foldMessages = (
  messages: readonly Message[],
  entryFor: (message: Message) => EntryRecord | undefined,
): VisibleNetView => {
  let view:
    | {
        revision: string;
        kind: "read" | "read-back" | "section";
        body: string;
        message: Message;
      }
    | undefined;
  let note: string | undefined;
  for (const message of messages) {
    const restored = sectionView(message);
    if (restored !== undefined) {
      view = { ...restored, kind: "section", message };
      note = undefined;
      continue;
    }
    const shown = toolView(message);
    if (shown !== undefined) {
      view = {
        revision: shown.revision,
        kind: shown.kind,
        body: shown.body,
        message,
      };
      note = undefined;
      continue;
    }
    const edited = noteRevision(message, entryFor(message));
    if (edited !== undefined && view !== undefined) note = edited;
  }
  if (view === undefined) return { state: "none" };
  if (note !== undefined && note !== view.revision)
    return {
      state: "stale",
      seen: view.revision,
      edited: note,
      message: view.message,
    };
  return { state: "current", ...view };
};

export const visibleNetView = (view: ContextView): VisibleNetView => {
  const entries = entryOf(view);
  return foldMessages(view.messages, (message) => entries.get(message));
};

/** Whether `message` is a net event for the section's tail rule: a tool view or a note. */
const isNetEvent = (message: Message, entry: EntryRecord | undefined) =>
  toolView(message) !== undefined || noteRevision(message, entry) !== undefined;

// ─── The pruning write ───────────────────────────────────────────────────────

/** Every read-back but the latest view's loses its read-back: the effective message, re-rendered pruned. */
export const pruneEdits = (view: ContextView): ContextEdit[] => {
  const latest = visibleNetView(view);
  if (latest.state === "none") return [];
  const entries = entryOf(view);
  return view.messages.flatMap((message): ContextEdit[] => {
    if (message === latest.message || message.role !== "toolResult") return [];
    const shown = toolView(message);
    if (shown?.kind !== "read-back") return [];
    const target = entries.get(message);
    if (target === undefined) return [];
    return [
      {
        target: target.id,
        action: "replace",
        messages: [
          {
            ...message,
            content: [{ type: "text", text: JSON.stringify(shown.output) }],
          },
        ],
      },
    ];
  });
};

export const pruneRequestId = (assistant: EntryId) =>
  `${pruneKind}:${assistant}`;

// ─── The host binding ────────────────────────────────────────────────────────

/** One per Harness: bound right after `Harness.open`, before anything schedules. */
export const createHostBinding = () => {
  let bound: Harness | undefined;
  return {
    bind: (harness: Harness) => {
      bound = harness;
    },
    conversation: async (
      id: ConversationId,
      ctx: Context,
    ): Promise<Conversation> => {
      if (bound === undefined) throw new Error("Host is not bound.");
      const conversation = await bound.conversation(id, ctx);
      if (conversation === undefined) throw new Error("No conversation.");
      return conversation;
    },
  };
};

export type HostBinding = ReturnType<typeof createHostBinding>;

export type HookCall = {
  readonly assistant: EntryId;
  readonly results: readonly EntryId[];
};

export type PruneHookOptions = {
  readonly calls?: HookCall[];
  readonly submissions?: SubmissionId[];
  /** Runs before the hook reads the context: may never resolve. */
  readonly beforeDecide?: (call: HookCall, ctx: Context) => Promise<void>;
  /** Runs after the write is admitted: may never resolve. */
  readonly afterWrite?: (call: HookCall, ctx: Context) => Promise<void>;
};

export const readBackPruningExtension = (
  host: HostBinding,
  options: PruneHookOptions = {},
) =>
  defineExtension({
    name: "probe.read-back-pruning",
    hooks: [
      hook(GenerationTask, {
        afterTools: async (assistant, results, api, ctx) => {
          const call = { assistant, results: [...results] };
          options.calls?.push(call);
          await options.beforeDecide?.(call, ctx);
          const conversation = await host.conversation(api.conversationId, ctx);
          const edits = pruneEdits(await conversation.context(ctx));
          if (edits.length === 0) return;
          const submission = await conversation.submit(
            {
              type: "write",
              requestId: pruneRequestId(assistant),
              entry: { kind: pruneKind, data: { assistant }, edits },
            },
            ctx,
          );
          options.submissions?.push(submission.id);
          await options.afterWrite?.(call, ctx);
        },
      }),
    ],
  });

// ─── The `net_view` section ──────────────────────────────────────────────────

/** The newest entry before `id`. */
export const entryBefore = async (
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

/** Whether the kept tail, before the first `pi.system` after the head, shows a net event. */
export const tailDecides = (view: ContextView): boolean => {
  const head = view.head;
  if (head === undefined) return false;
  const baseline = view.entries.find(
    (entry) => entry.id > head.id && SystemEntry.is(entry),
  );
  return view.entries.some(
    (entry, index) =>
      entry.id !== head.id &&
      (baseline === undefined || entry.id < baseline.id) &&
      (view.contributions[index] ?? []).some((message) =>
        isNetEvent(message, entry),
      ),
  );
};

/** What the section did, for assertions: counted through methods, so options stay unmutated. */
export const createSectionTrace = () => {
  const values = { renders: 0, restored: 0 };
  const errors: unknown[] = [];
  return {
    values,
    errors,
    render: () => {
      values.renders += 1;
    },
    restore: () => {
      values.restored += 1;
    },
    fail: (error: unknown) => {
      errors.push(error);
    },
  };
};

export type SectionTrace = ReturnType<typeof createSectionTrace>;

export type SectionOptions = {
  readonly trace?: SectionTrace;
  /** Runs once the head is a compaction and the tail doesn't decide, before the prefix read: may never resolve. */
  readonly beforePrefix?: (ctx: Context) => Promise<void>;
};

/** The rendering decision, apart from the section wrapper, so 0b can time it. */
export const renderNetView = async (
  conversation: Conversation,
  ctx: Context,
  beforePrefix?: (ctx: Context) => Promise<void>,
): Promise<string | undefined> => {
  const view = await conversation.context(ctx);
  const head = view.head;
  if (!CompactionEntry.is(head) || tailDecides(view)) return undefined;
  await beforePrefix?.(ctx);
  const before = await entryBefore(conversation, head.id, ctx);
  if (before === undefined) return undefined;
  const prefix = visibleNetView(
    await conversation.context(ctx, { at: before }),
  );
  return prefix.state === "current"
    ? sectionText(prefix.revision, prefix.body)
    : undefined;
};

export const netViewSection = (
  host: HostBinding,
  options: SectionOptions = {},
): PromptSection =>
  section(sectionKey, async (input, ctx) => {
    options.trace?.render();
    try {
      const conversation = await host.conversation(input.conversationId, ctx);
      const text = await renderNetView(conversation, ctx, options.beforePrefix);
      if (text !== undefined) options.trace?.restore();
      return text;
    } catch (error) {
      options.trace?.fail(error);
      return undefined;
    }
  });

// ─── Stand-in net tools ──────────────────────────────────────────────────────

/** A change: `ok` moves the net to `revision` and shows its read-back; `fail` errs. */
export const changeTool = defineTool({
  name: "change",
  description: "Changes the net.",
  parameters: obj({ outcome: str(), revision: str(), padding: str() }),
  execute: async ({ outcome, revision, padding }) => {
    if (outcome === "fail")
      return {
        isError: true,
        output: [{ type: "text", text: "The browser refused the change." }],
      };
    const output = { ok: true };
    const readBack = netAt(revision, Number(padding));
    return {
      output: [
        { type: "text", text: renderChange(output, readBack, revision) },
      ],
      details: {
        brunchBrowserResult: true,
        output,
        metadata: { documentRevision: { after: revision } },
      },
    };
  },
});

/** A full read at `revision`. */
export const readNetTool = defineTool({
  name: "readNet",
  description: "Reads the net.",
  parameters: obj({ revision: str(), padding: str() }),
  execute: async ({ revision, padding }) => {
    const output = netAt(revision, Number(padding));
    return {
      output: [{ type: "text", text: renderRead(output, revision) }],
      details: {
        brunchBrowserResult: true,
        output,
        metadata: { documentRevision: { before: revision } },
      },
    };
  },
});

export const ok = (revision: string, padding = 0) => ({
  outcome: "ok",
  revision,
  padding: String(padding),
});
export const failed = () => ({ outcome: "fail", revision: "", padding: "0" });
export const read = (revision: string, padding = 0) => ({
  revision,
  padding: String(padding),
});

/** Admit a hand-edit note as the route would, under its report ID. */
export const handEdit = (
  conversation: Conversation,
  reportId: string,
  revision: string,
) =>
  conversation.submit(
    {
      type: "write",
      requestId: `${handEditKind}:${reportId}`,
      entry: {
        kind: handEditKind,
        data: {
          episode: reportId.split(":")[0] ?? reportId,
          reportId,
          revision,
        },
        model: [{ role: "user", content: noteText(revision), timestamp: 0 }],
      },
    },
    context,
  );

// ─── The scripted faux model ─────────────────────────────────────────────────

const summarizerPrompt = "You are a context summarization assistant.";

const isSummarization = (messages: readonly Message[]) => {
  const first = messages[0];
  return (
    first?.role === "system" &&
    typeof first.content === "string" &&
    first.content.startsWith(summarizerPrompt)
  );
};

/**
 * Conversation requests are recorded and answered from a queue;
 * summarization requests are recorded apart and answered by `summarize`.
 * Two processes that build it with the same `contextWindow` name the same model.
 */
export const scriptedModel = (options?: { contextWindow?: number }) => {
  const requests: Message[][] = [];
  const summaries: Message[][] = [];
  const queue: FauxResponseStep[] = [];
  const control: {
    summarize: () => AssistantMessage | Promise<AssistantMessage>;
    /** Runs when a conversation request arrives, before it is answered. */
    onRequest?: (messages: readonly Message[]) => Promise<void> | void;
  } = {
    summarize: () => fauxAssistantMessage("## Goal\nModel a laundry."),
  };
  const faux = fauxProvider({
    models: [
      {
        id: "fold-probe",
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
    await control.onRequest?.(messages);
    const step = queue.shift();
    if (step === undefined) throw new Error("The probe's queue is empty.");
    return typeof step === "function" ? step(requestContext, ...rest) : step;
  };
  faux.setResponses(Array.from({ length: 5000 }, () => respond));
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

export type ScriptedModel = ReturnType<typeof scriptedModel>;

// ─── The harness ─────────────────────────────────────────────────────────────

export type FoldHarness = Awaited<ReturnType<typeof openFoldHarness>>;

/**
 * A Harness over `storage` with the stand-in tools, the pruning hook and the
 * section, bound to its own host binding right after open (unless `unbound`).
 * The compaction policy is read at each use, so tests flip it in place.
 */
export const openFoldHarness = async (
  storage: Storage,
  model: ScriptedModel,
  options: {
    readonly compaction?: CompactionPolicy;
    readonly hook?: Omit<PruneHookOptions, "calls" | "submissions">;
    readonly section?: Omit<SectionOptions, "trace">;
    readonly extensions?: readonly Extension[];
    readonly unbound?: boolean;
  } = {},
) => {
  const host = createHostBinding();
  const calls: HookCall[] = [];
  const submissions: SubmissionId[] = [];
  const reports: Report[] = [];
  const trace = createSectionTrace();
  const compaction: CompactionPolicy = options.compaction ?? {
    enabled: false,
    keepRecentTokens: 1,
    reserveTokens: 16_384,
    backgroundTokens: 0,
  };
  const registry = createRegistry();
  registry.install(
    defineExtension({
      name: "probe.net-tools",
      tools: [changeTool, readNetTool],
      sections: [netViewSection(host, { ...options.section, trace })],
    }),
  );
  registry.install(
    readBackPruningExtension(host, { ...options.hook, calls, submissions }),
  );
  for (const extension of options.extensions ?? []) registry.install(extension);
  const harness = await Harness.open(
    storage,
    {
      models: model.models,
      registry,
      settings: () => ({ compaction }),
      onReport: (report) => reports.push(report),
    },
    context,
  );
  if (options.unbound !== true) host.bind(harness);
  return { harness, host, calls, submissions, reports, trace, compaction };
};

// ─── Readers ─────────────────────────────────────────────────────────────────

/** The committed context a request was prepared from: as of the newest entry before its answer. */
export const committedContextBefore = async (
  conversation: Conversation,
  answer: EntryId,
): Promise<ContextView> => {
  const before = await entryBefore(conversation, answer, context);
  if (before === undefined) throw new Error("No entry before the answer.");
  return conversation.context(context, { at: before });
};

/** The `net_view` section texts a request carries. */
export const sectionsOf = (messages: readonly Message[]) =>
  messages.flatMap((message) =>
    message.role === "system" &&
    typeof message.sections?.[sectionKey] === "string"
      ? [message.sections[sectionKey]]
      : [],
  );

/** The restored section as a request shows it. */
export const restoredSection = (revision: string, body: string) =>
  `<${sectionKey}>\n${sectionText(revision, body)}\n</${sectionKey}>`;

/** The answer entries, oldest first. */
export const answers = (entries: readonly EntryRecord[]) =>
  entries.filter((entry) => entry.kind === "pi.assistant");

/** The current compaction head. */
export const compactionHead = async (conversation: Conversation) => {
  const { head } = await conversation.context(context);
  if (!CompactionEntry.is(head)) throw new Error("No compaction head.");
  return head;
};

/** A long answer, to grow the context. */
export const filler = (label: string) =>
  `${label} ${"The laundry runs on a schedule. ".repeat(120)}`;

/** A promise and its resolver, for gates. */
export const gate = () => {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
};

export { fauxAssistantMessage };
