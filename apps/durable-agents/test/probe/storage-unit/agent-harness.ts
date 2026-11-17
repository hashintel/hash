/**
 * The storage-unit probes' Harness: the successor's real agent wiring
 * (`createHashAgent`'s extensions over one host binding, the request-slot
 * gate, unlimited restarts) on any storage, without the server's
 * one-conversation-per-Harness registry, so one Harness can hold many
 * conversations.
 *
 * Mirrors `conversation-registry.ts`'s `open` up to the root: the gate is
 * installed and selected, the host is bound right after `Harness.open`, the
 * gate attached before scheduling. The bound Save (`installBoundSave`) is
 * not installed: the Harness-wide registry holds one Save, which is one of
 * the findings, and the probes never call Save.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type AgentChange,
  type ConversationCreateOptions,
  createRegistry,
  Harness,
  type HarnessOptions,
  type ModelRef,
  type Storage,
} from "@earendil-works/pi-durable";

import { createHashAgent } from "../../../src/agent/hash-agent";
import { createHostBinding } from "../../../src/agent/host-binding";
import { bindBrowserDocument } from "../../../src/browser-call/browser-call";

import type { RequestSlots } from "../../../src/server/durable-agents-server/request-slots";
import type { BrowserContext } from "@hashintel/brunch-agent";

export const context = BACKGROUND_CONTEXT;

export type AgentHarnessOptions = {
  readonly storage: Storage;
  readonly models: HarnessOptions["models"];
  readonly model: ModelRef;
  readonly slots: RequestSlots;
  readonly maxTurns?: number;
  readonly readOnly?: boolean;
};

export const openAgentHarness = async ({
  storage,
  models,
  model,
  slots,
  maxTurns = 100,
  readOnly,
}: AgentHarnessOptions) => {
  const hashAgent = createHashAgent();
  const host = createHostBinding();
  const registry = createRegistry();
  for (const extension of hashAgent.extensions(host))
    registry.install(extension);
  const gate = slots.gate();
  registry.install(gate.extension);
  const harness = await Harness.open(
    storage,
    {
      models,
      registry,
      settings: () => ({ restartLimit: Infinity }),
      ...(readOnly === true ? { readOnly } : {}),
    },
    context,
  );
  host.bind(harness);
  if (readOnly !== true) await gate.attach(harness, context);
  const agent: AgentChange = {
    ...hashAgent.agent,
    model,
    maxTurns,
    extensions: [...hashAgent.agent.extensions, gate.extension],
  };
  return { harness, registry, host, agent };
};

export type AgentHarness = Awaited<ReturnType<typeof openAgentHarness>>;

/** A browser binding for a probe conversation `name`. */
export const bindingFor = (name: string): BrowserContext["binding"] => ({
  conversationId: name,
  documentId: `net-${name}`,
});

/** Create options for a new conversation bound to `name`'s binding, with `init` after the binding. */
export const boundConversation = (
  agent: AgentChange,
  name: string,
  init?: ConversationCreateOptions["init"],
): ConversationCreateOptions => ({
  ownership: { kind: "ownerless" },
  agent,
  init: async (tx, conversationId) => {
    await bindBrowserDocument(tx, conversationId, bindingFor(name));
    await init?.(tx, conversationId);
  },
});
