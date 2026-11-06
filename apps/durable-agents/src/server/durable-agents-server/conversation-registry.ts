/**
 * The conversations this process serves: one Harness per conversation, on its
 * own storage, opened on first use and cached. Ownership moves to the newest
 * opener, and a Harness that lost it would answer reads from its own memory
 * without meeting the storage's fence; so every acquisition first asks the
 * storage whether it still owns the conversation, and reopens it (taking
 * ownership back) when it does not, since routing sent the request here.
 */
import {
  type AgentChange,
  type Conversation,
  Harness,
  type HarnessOptions,
  type HarnessSettings,
  type RegistryReader,
} from "@earendil-works/pi-durable";

import type {
  OpenConversationStorage,
  OwnedStorage,
} from "../conversation-storage";
import type { Context } from "@earendil-works/chord";

export type ConversationRegistryOptions = {
  readonly openStorage: OpenConversationStorage;
  /** A registry per Harness, with the agent's extensions installed. */
  readonly createRegistry: () => RegistryReader;
  readonly models: HarnessOptions["models"];
  /** The agent a new conversation's root starts with. */
  readonly agent: AgentChange;
  readonly settings?: HarnessOptions["settings"];
};

/** A conversation as this process serves it. */
export type OpenConversation = {
  readonly harness: Harness;
  /** The conversation itself: its Harness's root. */
  readonly root: Conversation;
};

type Opened = OpenConversation & {
  readonly storage: OwnedStorage;
  failed: boolean;
};

/**
 * Waiting browser calls keep their tool call open across restarts, so no
 * restart count ends one.
 *
 * TODO: the host-side crash-loop guard (a later wave): with no restart limit, a
 * task that crashes its process is resumed on every open, forever.
 */
const unlimitedRestarts =
  (settings: HarnessOptions["settings"]) => (): HarnessSettings => ({
    ...(typeof settings === "function" ? settings() : settings),
    restartLimit: Infinity,
  });

export const createConversationRegistry = (
  options: ConversationRegistryOptions,
  context: Context,
) => {
  const opened = new Map<string, Opened>();
  /** Per conversation, the acquisition in progress: acquisitions of one conversation run one at a time. */
  const pending = new Map<string, Promise<unknown>>();
  let closed = false;

  const open = async (conversationId: string): Promise<Opened> => {
    const storage = await options.openStorage(conversationId);
    const harness = await Harness.open(
      storage,
      {
        models: options.models,
        registry: options.createRegistry(),
        settings: unlimitedRestarts(options.settings),
      },
      context,
    );
    // Continue whatever run the conversation's previous owner left unfinished.
    harness.resume();
    const root = await harness.root(context, { agent: options.agent });
    const entry: Opened = { harness, root, storage, failed: false };
    void harness.closed.then((end) => {
      if (end.kind === "failed") entry.failed = true;
    });
    return entry;
  };

  const acquireNow = async (conversationId: string): Promise<Opened> => {
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
    const next = await open(conversationId);
    opened.set(conversationId, next);
    return next;
  };

  /** The conversation's open Harness, owning its storage at the time of the check. */
  const acquire = (conversationId: string): Promise<OpenConversation> => {
    const previous = pending.get(conversationId) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => acquireNow(conversationId));
    pending.set(conversationId, next);
    void next
      .catch(() => {})
      .finally(() => {
        if (pending.get(conversationId) === next)
          pending.delete(conversationId);
      });
    return next;
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

  return { acquire, close };
};

export type ConversationRegistry = ReturnType<
  typeof createConversationRegistry
>;
