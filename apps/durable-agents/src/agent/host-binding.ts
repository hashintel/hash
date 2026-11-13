/**
 * The Harness a host opened, as the agent's tools, hooks and prompt sections
 * reach it. Hooks get a read-only `HookApi`, sections only a document reader
 * and tools no `context()`; each reaches its conversation's effective context
 * (`context()`, `context({ at })`) and admits host writes through the
 * conversation this binding returns.
 *
 * One binding per Harness: the host creates it before the registry, installs
 * extensions built over it, and binds the Harness right after `Harness.open`,
 * which schedules nothing, so no task runs unbound.
 */
import type { Context } from "@earendil-works/chord";
import type {
  Conversation,
  ConversationId,
  Harness,
} from "@earendil-works/pi-durable";

export type HostBinding = {
  /** Bind the Harness the host opened with extensions built over this binding. */
  readonly bind: (harness: Harness) => void;
  /** The conversation through the bound Harness; throws when unbound or the conversation is absent. */
  readonly conversation: (
    conversationId: ConversationId,
    context: Context,
  ) => Promise<Conversation>;
};

export const createHostBinding = (): HostBinding => {
  let bound: Harness | undefined;
  return {
    bind: (harness) => {
      bound = harness;
    },
    conversation: async (conversationId, context) => {
      if (bound === undefined) throw new Error("Host is not bound.");
      const conversation = await bound.conversation(conversationId, context);
      if (conversation === undefined)
        throw new Error(`No conversation ${conversationId}.`);
      return conversation;
    },
  };
};
