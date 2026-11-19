/**
 * The conversations this process serves: one Harness per conversation, on its
 * own storage, opened on first use and cached. Ownership moves to the newest
 * opener, and a Harness that lost it would answer reads from its own memory
 * without meeting the storage's fence; so every acquisition first asks the
 * storage whether it still owns the conversation, and reopens it (taking
 * ownership back) when it does not, since routing sent the request here.
 *
 * Only an acquisition that asks to create one creates a conversation; any
 * other finds an unknown ID absent without creating its storage. A creation
 * given a document binding binds the conversation to it in the commit that
 * creates its root, so no crash leaves it unbound and `afterBind` sees it bound.
 *
 * Opening a conversation, before its scheduling starts: its host binding is
 * bound to the new Harness, its agent gets the request-slot gate and the turn
 * limit, the host's `afterBind` installs what the conversation's stored state
 * decides, and the crash-loop guard inspects its tasks.
 */
import {
  type AgentChange,
  AgentDoc,
  type AgentState,
  type Conversation,
  type Extension,
  Harness,
  type HarnessOptions,
  type HarnessSettings,
  LiveDoc,
  type Registry,
  type Report,
  ROOT_CONVERSATION_ID,
  type SubmissionId,
} from "@earendil-works/pi-durable";

import { createHostBinding, type HostBinding } from "../../agent/host-binding";
import {
  bindBrowserDocument,
  recoverBrowserCallWakes,
} from "../../browser-call/browser-call";
import {
  type CrashLoopAbort,
  guardCrashLoops,
} from "./conversation-registry/crash-loop-guard";

import type {
  ConversationStorageExists,
  OpenConversationStorage,
  OwnedStorage,
} from "../conversation-storage";
import type { RequestSlots } from "./request-slots";
import type { Context } from "@earendil-works/chord/context";
import type { BrowserContext } from "@hashintel/brunch-agent";

export type { CrashLoopAbort } from "./conversation-registry/crash-loop-guard";
export type { CrashLoopingTask } from "./shared/crash-loop-entry";

export type ConversationRegistryOptions = {
  readonly openStorage: OpenConversationStorage;
  readonly storageExists: ConversationStorageExists;
  /**
   * A registry per Harness, with the agent's extensions installed, built over
   * that Harness's host binding; the server installs its own beside them.
   */
  readonly createRegistry: (host: HostBinding) => Registry;
  readonly models: HarnessOptions["models"];
  /** The agent a new conversation's root starts with. */
  readonly agent: AgentChange;
  readonly settings?: HarnessOptions["settings"];
  /**
   * The Harness clock (`HarnessOptions.now`), which browser-call expiries are
   * on; `Date.now` when omitted. The browser-call routes and the abandoned
   * turn sweep compare expiries on the same clock.
   */
  readonly now?: HarnessOptions["now"];
  /**
   * Runs on every open, once the host binding is bound and the root is known,
   * before scheduling resumes: where a host installs into the Harness's
   * registry what depends on the conversation's stored state, so no request
   * goes out without it.
   */
  readonly afterBind?: (
    conversation: OpenConversation,
    context: Context,
  ) => Promise<void>;
  /**
   * Each report of a conversation's Harness (`HarnessOptions.onReport`):
   * failures that fail no operation, and the Harness's own failure, once.
   */
  readonly onReport?: (conversationId: string, report: Report) => void;
};

/** What the registry enforces on every conversation it opens. */
export type ConversationLimits = {
  /** Tool rounds one run takes at most: the conversation's `maxTurns`. */
  readonly maxTurns: number;
  /** Restarts in a row after which the crash-loop guard aborts a task's work; `Infinity` never. */
  readonly crashLoopRestarts: number;
  /** The process's model request slots. */
  readonly requestSlots: RequestSlots;
  /** Each conversation as it opens, with what its guard aborted, if anything. */
  readonly onOpen?: (
    conversationId: string,
    crashLoop: CrashLoopAbort | undefined,
  ) => void;
};

/** What a new conversation starts with, written in the commit that creates it. */
export type ConversationSeed = {
  /** The editor binding its browser calls are issued to (`BrowserBindingDoc`); unbound when absent. */
  readonly binding?: BrowserContext["binding"];
};

/** A conversation as this process serves it. */
export type OpenConversation = {
  readonly harness: Harness;
  /** The conversation itself: its Harness's root. */
  readonly root: Conversation;
  /** The Harness's live registry: an install replaces an extension by name for the next operation. */
  readonly registry: Registry;
  /** The host binding the registry's extensions were built over, bound to `harness`. */
  readonly host: HostBinding;
};

type Opened = OpenConversation & {
  readonly storage: OwnedStorage;
  /** Its close has begun, a failed storage call's included: never handed out again. */
  closing: boolean;
};

/**
 * Waiting browser calls keep their tool call open across restarts, so no
 * restart count ends one; the crash-loop guard bounds everything else.
 * Inputs queued behind a failed run are withdrawn: a client sees a queued
 * input only through its stream, which then ends with the error.
 */
const enforcedSettings =
  (settings: HarnessOptions["settings"]) => (): HarnessSettings => ({
    ...(typeof settings === "function" ? settings() : settings),
    restartLimit: Infinity,
    afterFailedRun: "withdraw",
  });

/** `Array.isArray` does not narrow a readonly array. */
const isExtensionList = (
  value: NonNullable<AgentChange["extensions"]>,
): value is readonly Extension[] => Array.isArray(value);

/** `agent` with `gate` selected, when it selects extensions at all; absent selects every installed one. */
const withGate = (agent: AgentChange, gate: Extension): AgentChange => {
  const { extensions } = agent;
  if (extensions === undefined || extensions === null) return agent;
  if (isExtensionList(extensions))
    return { ...agent, extensions: [...extensions, gate] };
  return {
    ...agent,
    extensions: { ...extensions, add: [...(extensions.add ?? []), gate] },
  };
};

/**
 * A stored extension selection as a change that writes it back as it is;
 * `configure` keeps only each extension's name. The default selection is an
 * empty edit of itself.
 */
const storedSelection = (
  selection: AgentState["extensions"],
): NonNullable<AgentChange["extensions"]> => {
  const handles = (names: readonly string[]) =>
    names.map((name): Extension => ({ name }));
  if (selection === undefined) return {};
  if (Array.isArray(selection)) return handles(selection);
  return {
    ...(selection.add === undefined ? {} : { add: handles(selection.add) }),
    ...(selection.remove === undefined
      ? {}
      : { remove: handles(selection.remove) }),
  };
};

/**
 * Bring a conversation's stored agent up to the server's limits: the gate
 * selected, the turn limit set. `configure` replaces the stored selection
 * whole, and an `{ add, remove }` edit applies to the host default, so the
 * gate goes into a copy of the stored selection.
 */
const enforceAgent = async (
  harness: Harness,
  root: Conversation,
  gate: Extension,
  maxTurns: number,
  context: Context,
) => {
  const [agent, stored] = await Promise.all([
    root.agent(context),
    harness.snapshot(AgentDoc, root.id, context),
  ]);
  const gated = agent.extensions.some(({ name }) => name === gate.name);
  const change: AgentChange = {
    ...(gated
      ? {}
      : {
          extensions: withGate(
            { extensions: storedSelection(stored?.extensions) },
            gate,
          ).extensions,
        }),
    ...(agent.maxTurns === maxTurns ? {} : { maxTurns }),
  };
  if (Object.keys(change).length > 0) await root.configure(change, context);
};

export const createConversationRegistry = (
  options: ConversationRegistryOptions,
  limits: ConversationLimits,
  context: Context,
) => {
  const opened = new Map<string, Opened>();
  /** Per conversation, the acquisition in progress: acquisitions of one conversation run one at a time. */
  const pending = new Map<string, Promise<unknown>>();
  /** Closes of Harnesses evicted for lost ownership, until each settles. */
  const evictions = new Set<Promise<void>>();
  let closed = false;

  /** Opens the conversation; with `seed`, creating it from the seed when it does not exist. */
  const open = async (
    conversationId: string,
    seed: ConversationSeed | undefined,
    onRecoveringInput?: (input: SubmissionId | undefined) => void,
  ): Promise<Opened | undefined> => {
    if (seed === undefined && !(await options.storageExists(conversationId)))
      return undefined;
    const storage = await options.openStorage(conversationId);
    const gate = limits.requestSlots.gate();
    const host = createHostBinding();
    const registry = options.createRegistry(host);
    registry.install(gate.extension);
    const harness = await Harness.open(
      storage,
      {
        models: options.models,
        registry,
        settings: enforcedSettings(options.settings),
        ...(options.now === undefined ? {} : { now: options.now }),
        onReport: (report) => options.onReport?.(conversationId, report),
      },
      context,
    );
    // Open schedules nothing, so no tool, hook or section runs before this.
    host.bind(harness);
    try {
      const binding = seed?.binding;
      const root =
        seed === undefined
          ? await harness.conversation(ROOT_CONVERSATION_ID, context)
          : await harness.root(context, {
              agent: {
                ...withGate(options.agent, gate.extension),
                maxTurns: limits.maxTurns,
              },
              ...(binding === undefined
                ? {}
                : {
                    init: (tx, rootId) =>
                      bindBrowserDocument(tx, rootId, binding),
                  }),
            });
      if (root === undefined) {
        await harness.close(context);
        return undefined;
      }
      await enforceAgent(
        harness,
        root,
        gate.extension,
        limits.maxTurns,
        context,
      );
      await options.afterBind?.({ harness, root, registry, host }, context);
      await gate.attach(harness, context);
      const crashLoop = await guardCrashLoops(
        harness,
        root,
        limits.crashLoopRestarts,
        context,
      );
      // Only the request opening this owner gets the input it is about to resume.
      if (onRecoveringInput !== undefined) {
        const live = await harness.snapshot(LiveDoc, root.id, context);
        onRecoveringInput(live?.run?.inputs.at(0));
      }
      // The storage fence applies to every recovered wake's abort mark.
      await recoverBrowserCallWakes(harness, root.id, context);
      const entry: Opened = {
        harness,
        root,
        registry,
        host,
        storage,
        closing: false,
      };
      // `closed` settles only once running task code returns, which may ignore its signal.
      harness.subscribeClose(() => {
        entry.closing = true;
      });
      // Continue whatever run the conversation's previous owner left unfinished.
      harness.resume();
      limits.onOpen?.(conversationId, crashLoop);
      return entry;
    } catch (error) {
      await harness.close(context).catch(() => {});
      throw error;
    }
  };

  const acquireNow = async (
    conversationId: string,
    seed: ConversationSeed | undefined,
    onRecoveringInput?: (input: SubmissionId | undefined) => void,
  ): Promise<Opened | undefined> => {
    if (closed) throw new Error("The conversation registry is closed.");
    const current = opened.get(conversationId);
    if (
      current !== undefined &&
      !current.closing &&
      (await current.storage.isOwner())
    ) {
      return current;
    }
    if (current !== undefined) {
      opened.delete(conversationId);
      // Its commits already fail at the fence; closing ends its tasks and the streams that follow it.
      const eviction = current.harness.close(context).catch(() => {});
      evictions.add(eviction);
      void eviction.finally(() => evictions.delete(eviction));
    }
    const next = await open(conversationId, seed, onRecoveringInput);
    if (next !== undefined) opened.set(conversationId, next);
    return next;
  };

  const serialized = <T>(
    conversationId: string,
    acquisition: () => Promise<T>,
  ): Promise<T> => {
    const previous = pending.get(conversationId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(acquisition);
    pending.set(conversationId, next);
    void next
      .catch(() => {})
      .finally(() => {
        if (pending.get(conversationId) === next)
          pending.delete(conversationId);
      });
    return next;
  };

  /**
   * The conversation's open Harness, owning its storage at the time of the
   * check; `undefined` for a conversation that does not exist, whose storage
   * this does not create. `onRecoveringInput` runs only if this acquisition
   * opens an owner, before it wakes or resumes that owner's unfinished work.
   */
  const acquire = (
    conversationId: string,
    onRecoveringInput?: (input: SubmissionId | undefined) => void,
  ): Promise<OpenConversation | undefined> =>
    serialized(conversationId, () =>
      acquireNow(conversationId, undefined, onRecoveringInput),
    );

  /**
   * As `acquire`, creating the conversation, its storage and root from
   * `seed`, when it does not exist. An existing conversation ignores `seed`.
   */
  const create = (
    conversationId: string,
    seed: ConversationSeed = {},
  ): Promise<OpenConversation> =>
    serialized(conversationId, async () => {
      const conversation = await acquireNow(conversationId, seed);
      if (conversation === undefined)
        throw new Error(`Conversation ${conversationId} was not created.`);
      return conversation;
    });

  /** The conversation as already open here, if it still owns its storage; never opens or reopens. */
  const ifOwned = async (
    conversationId: string,
  ): Promise<OpenConversation | undefined> => {
    const current = opened.get(conversationId);
    if (current === undefined) return undefined;
    const stillCurrent = () =>
      !closed && !current.closing && opened.get(conversationId) === current;
    return stillCurrent() && (await current.storage.isOwner()) && stillCurrent()
      ? current
      : undefined;
  };

  const close = async () => {
    closed = true;
    await Promise.allSettled(pending.values());
    const harnesses = [...opened.values()].map(({ harness }) => harness);
    opened.clear();
    await Promise.all([
      ...harnesses.map((harness) => harness.close(context).catch(() => {})),
      ...evictions,
    ]);
  };

  return { acquire, create, ifOwned, close };
};

export type ConversationRegistry = ReturnType<
  typeof createConversationRegistry
>;
