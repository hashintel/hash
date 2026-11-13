/**
 * The conversations this process serves: one Harness per conversation, on its
 * own storage, opened on first use and cached. Ownership moves to the newest
 * opener, and a Harness that lost it would answer reads from its own memory
 * without meeting the storage's fence; so every acquisition first asks the
 * storage whether it still owns the conversation, and reopens it (taking
 * ownership back) when it does not, since routing sent the request here.
 *
 * Only an acquisition that asks to create one creates a conversation; any
 * other finds an unknown ID absent without creating its storage.
 *
 * Opening a conversation, before its scheduling starts: its host binding is
 * bound to the new Harness, its agent gets the request-slot gate and the turn
 * limit, the host's `afterBind` installs what the conversation's stored state
 * decides, and the crash-loop guard inspects its tasks.
 */
import {
  type AgentChange,
  type Conversation,
  type Extension,
  Harness,
  type HarnessOptions,
  type HarnessSettings,
  type Registry,
  ROOT_CONVERSATION_ID,
} from "@earendil-works/pi-durable";

import { createHostBinding, type HostBinding } from "../../agent/host-binding";
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
import type { Context } from "@earendil-works/chord";

export type {
  CrashLoopAbort,
  CrashLoopingTask,
} from "./conversation-registry/crash-loop-guard";

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
   * Runs on every open, once the host binding is bound and the root is known,
   * before scheduling resumes: where a host installs into the Harness's
   * registry what depends on the conversation's stored state, so no request
   * goes out without it.
   */
  readonly afterBind?: (
    conversation: OpenConversation,
    context: Context,
  ) => Promise<void>;
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
  failed: boolean;
};

/**
 * Waiting browser calls keep their tool call open across restarts, so no
 * restart count ends one; the crash-loop guard bounds everything else.
 */
const unlimitedRestarts =
  (settings: HarnessOptions["settings"]) => (): HarnessSettings => ({
    ...(typeof settings === "function" ? settings() : settings),
    restartLimit: Infinity,
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

/** Bring a conversation's stored agent up to the server's limits: the gate selected, the turn limit set. */
const enforceAgent = async (
  root: Conversation,
  gate: Extension,
  maxTurns: number,
  context: Context,
) => {
  const agent = await root.agent(context);
  const gated = agent.extensions.some(({ name }) => name === gate.name);
  const change: AgentChange = {
    ...(gated ? {} : { extensions: { add: [gate] } }),
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
  let closed = false;

  const open = async (
    conversationId: string,
    create: boolean,
  ): Promise<Opened | undefined> => {
    if (!create && !(await options.storageExists(conversationId)))
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
        settings: unlimitedRestarts(options.settings),
      },
      context,
    );
    // Open schedules nothing, so no tool, hook or section runs before this.
    host.bind(harness);
    try {
      const root = create
        ? await harness.root(context, {
            agent: {
              ...withGate(options.agent, gate.extension),
              maxTurns: limits.maxTurns,
            },
          })
        : await harness.conversation(ROOT_CONVERSATION_ID, context);
      if (root === undefined) {
        await harness.close(context);
        return undefined;
      }
      await enforceAgent(root, gate.extension, limits.maxTurns, context);
      await options.afterBind?.({ harness, root, registry, host }, context);
      await gate.attach(harness, context);
      const crashLoop = await guardCrashLoops(
        harness,
        root,
        limits.crashLoopRestarts,
        context,
      );
      // Continue whatever run the conversation's previous owner left unfinished.
      harness.resume();
      const entry: Opened = {
        harness,
        root,
        registry,
        host,
        storage,
        failed: false,
      };
      void harness.closed.then((end) => {
        if (end.kind === "failed") entry.failed = true;
      });
      limits.onOpen?.(conversationId, crashLoop);
      return entry;
    } catch (error) {
      await harness.close(context).catch(() => {});
      throw error;
    }
  };

  const acquireNow = async (
    conversationId: string,
    create: boolean,
  ): Promise<Opened | undefined> => {
    if (closed) throw new Error("The conversation registry is closed.");
    const current = opened.get(conversationId);
    if (
      current !== undefined &&
      !current.failed &&
      (await current.storage.isOwner())
    ) {
      return current;
    }
    if (current !== undefined) {
      opened.delete(conversationId);
      // Its commits already fail at the fence; closing ends its tasks and the streams that follow it.
      void current.harness.close(context).catch(() => {});
    }
    const next = await open(conversationId, create);
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
   * this does not create.
   */
  const acquire = (
    conversationId: string,
  ): Promise<OpenConversation | undefined> =>
    serialized(conversationId, () => acquireNow(conversationId, false));

  /** As `acquire`, creating the conversation, its storage and root, when it does not exist. */
  const create = (conversationId: string): Promise<OpenConversation> =>
    serialized(conversationId, async () => {
      const conversation = await acquireNow(conversationId, true);
      if (conversation === undefined)
        throw new Error(`Conversation ${conversationId} was not created.`);
      return conversation;
    });

  /** The conversation as already open here, if it still owns its storage; never opens or reopens. */
  const ifOwned = async (
    conversationId: string,
  ): Promise<OpenConversation | undefined> => {
    const current = opened.get(conversationId);
    if (current === undefined || current.failed) return undefined;
    return (await current.storage.isOwner().catch(() => false))
      ? current
      : undefined;
  };

  const close = async () => {
    closed = true;
    await Promise.allSettled(pending.values());
    const harnesses = [...opened.values()].map(({ harness }) => harness);
    opened.clear();
    await Promise.all(
      harnesses.map((harness) => harness.close(context).catch(() => {})),
    );
  };

  return { acquire, create, ifOwned, close };
};

export type ConversationRegistry = ReturnType<
  typeof createConversationRegistry
>;
