/**
 * Probe-local scaffolding for the `afterTools` read-back probes: stand-in net
 * tools that render their net view into the model's `output`, the probe's
 * derivation of the latest net view the model can see, the outcome-aware
 * pruning decision, and an `afterTools` hook that admits that decision as a
 * stored edit through a host closure.
 *
 * Nothing here is product code. The net view is rendered as a tagged block so
 * the derivation can tell a complete view from one Pi's output bound cut.
 */
import { awaitWithContext } from "@earendil-works/chord/context";
import {
  type ContextEdit,
  type ContextView,
  type Conversation,
  type ConversationId,
  createRegistry,
  defineExtension,
  defineTool,
  type EntryId,
  type Extension,
  GenerationTask,
  Harness,
  hook,
  type Report,
  type Storage,
  type SubmissionId,
  type ToolExecutionMode,
  type ToolExecutionResult,
} from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";

import { context } from "../support";

import type { Context } from "@earendil-works/chord";
import type { Message, ToolResultMessage } from "@earendil-works/pi-ai";
import type { Models } from "@earendil-works/pi-ai/models";

// ─── The rendered net view ───────────────────────────────────────────────────

type ViewKind = "view" | "read-back";

/** A net's structure at `revision`, `padding` long, ending with a sentinel. */
const netAt = (revision: string, padding = 0) => ({
  revision,
  places: [{ id: "place-dryer", name: "Dryer" }],
  padding: "x".repeat(padding),
  last: "END OF NET",
});

/** A complete net view as the model reads it: a tagged block of JSON. */
export const renderView = (kind: ViewKind, revision: string, padding = 0) =>
  `<net-${kind} revision="${revision}">${JSON.stringify(netAt(revision, padding))}</net-${kind}>`;

const viewPattern =
  /<net-(view|read-back) revision="([^"]+)">([\s\S]*?)<\/net-\1>/gu;
const readBackPattern =
  /\n?<net-read-back revision="[^"]+">[\s\S]*?<\/net-read-back>/gu;

/** The text of a tool result's text parts, joined. */
const resultText = (message: ToolResultMessage): string =>
  message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");

/** The complete net views a message shows, in order: a block whose JSON parses and closes. */
const completeViews = (message: Message) => {
  if (message.role !== "toolResult" || message.isError) return [];
  const text = resultText(message);
  // A bounded result says so in its rendered diagnostics; nothing in it counts as a full view.
  if (text.includes("Output truncated")) return [];
  return [...text.matchAll(viewPattern)].flatMap((match) => {
    const [, kind, revision, body] = match;
    try {
      const parsed = JSON.parse(body ?? "") as { last?: unknown };
      return parsed.last === "END OF NET"
        ? [{ kind: kind as ViewKind, revision: revision! }]
        : [];
    } catch {
      return [];
    }
  });
};

export type VisibleNetView = {
  readonly toolCallId: string;
  readonly kind: ViewKind;
  readonly revision: string;
  /** The message that shows it, by identity, as `ContextView.messages` holds it. */
  readonly message: ToolResultMessage;
};

/**
 * The latest net view the model can see: the last complete view in
 * `messages`, in their order (Pi's call order, edits applied, orphans
 * dropped). Not the product derivation.
 */
export const latestVisibleNetView = (
  messages: readonly Message[],
): VisibleNetView | undefined => {
  let latest: VisibleNetView | undefined;
  for (const message of messages) {
    if (message.role !== "toolResult") continue;
    const view = completeViews(message).at(-1);
    if (view !== undefined)
      latest = { toolCallId: message.toolCallId, ...view, message };
  }
  return latest;
};

export const noViewRefusal = "No net view in context: read the net first.";

/** Fold 1 over the effective messages: the revision a change may assume, or a refusal. */
export const freshness = (
  messages: readonly Message[],
): { readonly revision: string } | { readonly refusal: string } => {
  const latest = latestVisibleNetView(messages);
  return latest === undefined
    ? { refusal: noViewRefusal }
    : { revision: latest.revision };
};

/** Every successful result in `messages` that shows a complete read-back, as `toolCallId`s in order. */
export const shownReadBacks = (messages: readonly Message[]): string[] =>
  messages.flatMap((message) =>
    message.role === "toolResult" &&
    completeViews(message).some(({ kind }) => kind === "read-back")
      ? [message.toolCallId]
      : [],
  );

// ─── The pruning decision ────────────────────────────────────────────────────

/**
 * The edits that leave only the latest visible view's read-back: every other
 * complete read-back in the effective context loses its block. The edit
 * replaces the *effective* message, so earlier edits are kept. Nothing is
 * pruned without a complete latest view, so the only view is never removed.
 */
export const pruneEdits = (view: ContextView): ContextEdit[] => {
  const latest = latestVisibleNetView(view.messages);
  if (latest === undefined) return [];
  return view.messages.flatMap((message): ContextEdit[] => {
    if (message === latest.message || message.role !== "toolResult") return [];
    if (!completeViews(message).some(({ kind }) => kind === "read-back"))
      return [];
    // `messages` holds the contributions' message objects; identity maps one back to its entry.
    const index = view.contributions.findIndex((messages) =>
      messages.includes(message),
    );
    const target = view.entries[index];
    if (target === undefined) return [];
    return [
      {
        target: target.id,
        action: "replace",
        messages: [
          {
            ...message,
            content: message.content.map((part) =>
              part.type === "text"
                ? { ...part, text: part.text.replace(readBackPattern, "") }
                : part,
            ),
          },
        ],
      },
    ];
  });
};

export const pruneEntryKind = "probe.prune-read-backs";

/** The request ID of a round's pruning write: one per issuing assistant entry. */
export const pruneRequestId = (assistant: EntryId) =>
  `probe.prune-read-backs:${assistant}`;

// ─── The host-bound hook ─────────────────────────────────────────────────────

/** What the probe observes of each `afterTools` invocation. */
export type HookCall = {
  readonly assistant: EntryId;
  readonly results: readonly EntryId[];
};

/**
 * The host closure: the Harness the host opened, bound after `Harness.open`
 * and before scheduling starts. Unbound, the hook fails and is reported.
 */
export type HostBinding = { harness: Harness | undefined };

export type PruneHookOptions = {
  readonly host: HostBinding;
  readonly calls?: HookCall[];
  /** The submission ID each admitted pruning write returned. */
  readonly submissions?: SubmissionId[];
  /** Runs before the hook reads the context: may throw, or never resolve. */
  readonly beforeDecide?: (call: HookCall, context: Context) => Promise<void>;
  /** Runs after the write is admitted: may throw, or never resolve. */
  readonly afterWrite?: (call: HookCall, context: Context) => Promise<void>;
};

/** The conversation the hook's task belongs to, through the host's Harness. */
const hostConversation = async (
  host: HostBinding,
  conversationId: ConversationId,
  hookContext: Context,
): Promise<Conversation> => {
  if (host.harness === undefined) throw new Error("Host is not bound.");
  const conversation = await host.harness.conversation(
    conversationId,
    hookContext,
  );
  if (conversation === undefined) throw new Error("No conversation.");
  return conversation;
};

/**
 * Decide the pruning from the conversation's committed effective context
 * and admit it as a write under the round's request ID. Returns the
 * submission ID, or `undefined` when nothing needs pruning.
 */
export const admitPruning = async (
  conversation: Conversation,
  assistant: EntryId,
  hookContext: Context,
): Promise<SubmissionId | undefined> => {
  const edits = pruneEdits(await conversation.context(hookContext));
  if (edits.length === 0) return undefined;
  const submission = await conversation.submit(
    {
      type: "write",
      requestId: pruneRequestId(assistant),
      entry: { kind: pruneEntryKind, data: { assistant }, edits },
    },
    hookContext,
  );
  return submission.id;
};

export const pruneReadBacksExtension = (options: PruneHookOptions) =>
  defineExtension({
    name: "probe.prune-read-backs",
    hooks: [
      hook(GenerationTask, {
        afterTools: async (assistant, results, api, hookContext) => {
          const call = { assistant, results: [...results] };
          options.calls?.push(call);
          await options.beforeDecide?.(call, hookContext);
          const conversation = await hostConversation(
            options.host,
            api.conversationId,
            hookContext,
          );
          const written = await admitPruning(
            conversation,
            assistant,
            hookContext,
          );
          if (written === undefined) return;
          options.submissions?.push(written);
          await options.afterWrite?.(call, hookContext);
        },
      }),
    ],
  });

// ─── Stand-in net tools ──────────────────────────────────────────────────────

/**
 * A net change, in Brunch's result shape: `outcome` `ok` changes the net to
 * `revision` and shows its read-back; `unchanged` reports no `after`; `fail`
 * is an error result. `padding` grows the read-back.
 */
export const changeTool = (
  options: {
    readonly executionMode?: ToolExecutionMode;
    readonly outputLimits?: { readonly maxBytes?: number };
  } = {},
) =>
  defineTool({
    name: "change",
    description: "Changes the net.",
    parameters: obj({
      outcome: str(),
      revision: str(),
      before: str(),
      padding: str(),
    }),
    ...(options.executionMode === undefined
      ? {}
      : { executionMode: options.executionMode }),
    ...(options.outputLimits === undefined
      ? {}
      : { outputLimits: options.outputLimits }),
    execute: async ({
      outcome,
      revision,
      before,
      padding,
    }): Promise<ToolExecutionResult> => {
      if (outcome === "fail")
        return {
          isError: true,
          output: [{ type: "text", text: "The browser refused the change." }],
        };
      if (outcome === "unchanged")
        return {
          output: [{ type: "text", text: "Nothing changed." }],
          details: { metadata: { documentRevision: { before } } },
        };
      const size = Number(padding);
      return {
        output: [
          {
            type: "text",
            text: `Applied.\n${renderView("read-back", revision, size)}`,
          },
        ],
        details: {
          metadata: {
            documentRevision: { before, after: revision },
            readBack: netAt(revision, size),
          },
        },
      };
    },
  });

/** A net read at `revision`. */
export const readTool = defineTool({
  name: "read",
  description: "Reads the net.",
  parameters: obj({ revision: str() }),
  execute: async ({ revision }) => ({
    output: [{ type: "text", text: renderView("view", revision) }],
    details: { metadata: { documentRevision: { before: revision } } },
  }),
});

/** A change that waits for the browser until released or cancelled; `started` resolves once it waits. */
export const waitingChangeTool = () => {
  let release: () => void = () => undefined;
  let started: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const tool = defineTool({
    name: "waitingChange",
    description: "Changes the net once the browser answers.",
    parameters: obj({ revision: str() }),
    execute: async ({ revision }, _api, toolContext) => {
      started();
      await awaitWithContext(gate, toolContext);
      return {
        output: [
          {
            type: "text",
            text: `Applied.\n${renderView("read-back", revision)}`,
          },
        ],
      };
    },
  });
  return { tool, release: () => release(), started: waiting };
};

/** `change` call arguments. */
export const ok = (revision: string, before: string, padding = 0) => ({
  outcome: "ok",
  revision,
  before,
  padding: String(padding),
});
export const failed = (before: string) => ({
  outcome: "fail",
  revision: "",
  before,
  padding: "0",
});
export const unchanged = (before: string) => ({
  outcome: "unchanged",
  revision: "",
  before,
  padding: "0",
});

// ─── Harness ─────────────────────────────────────────────────────────────────

export type ProbeHarness = {
  readonly harness: Harness;
  readonly host: HostBinding;
  readonly calls: HookCall[];
  readonly submissions: SubmissionId[];
  readonly reports: Report[];
};

/**
 * A Harness over `storage` with the stand-in tools and the pruning hook,
 * bound to its own host closure after open: open does not schedule, so no
 * task runs before the binding exists.
 */
export const openProbeHarness = async (
  storage: Storage,
  models: Models,
  options: {
    readonly tools?: Parameters<typeof defineExtension>[0]["tools"];
    readonly hook?: Omit<PruneHookOptions, "host" | "calls" | "submissions">;
    /** Leave the host unbound, as a host that forgot to attach would. */
    readonly unbound?: boolean;
    readonly settings?: Parameters<typeof Harness.open>[1]["settings"];
    readonly extraExtensions?: readonly Extension[];
  } = {},
): Promise<ProbeHarness> => {
  const host: HostBinding = { harness: undefined };
  const calls: HookCall[] = [];
  const submissions: SubmissionId[] = [];
  const reports: Report[] = [];
  const registry = createRegistry();
  registry.install(
    defineExtension({
      name: "probe.net-tools",
      tools: options.tools ?? [changeTool(), readTool],
    }),
  );
  registry.install(
    pruneReadBacksExtension({ host, calls, submissions, ...options.hook }),
  );
  for (const extension of options.extraExtensions ?? [])
    registry.install(extension);
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      onReport: (report) => reports.push(report),
      ...(options.settings === undefined ? {} : { settings: options.settings }),
    },
    context,
  );
  if (options.unbound !== true) host.harness = harness;
  return { harness, host, calls, submissions, reports };
};

/** Every model-facing text of the tool results in `messages`, by call ID. */
export const resultTexts = (messages: readonly Message[]) =>
  Object.fromEntries(
    messages.flatMap((message) =>
      message.role === "toolResult"
        ? [[message.toolCallId, resultText(message)]]
        : [],
    ),
  );
