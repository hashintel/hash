/**
 * Brunch's HASH agent on Pi Durable (`hash-agent-port.md` §1–§3): HASH's
 * prompt and skills, the Ledger, HASH's browser tools and Save, the read-back
 * pruning hook, the basis query and the `net_view` section. The only agent
 * the server builds (HA-1).
 *
 * A server installs `extensions(host)` in each Harness's registry, over that
 * Harness's host binding, creates a conversation's root with `agent` (adding
 * its model), and binds the conversation to the browser's editor with
 * `bindBrowserDocument` so claims can prove the binding.
 *
 * Save's description names the bound document, which Pi doesn't store: the
 * registry starts with a placeholder Save, and the server calls
 * `installBoundSave` whenever the binding may be known and before any request
 * goes out: on every open, after the host is bound and before scheduling
 * resumes, and right after the binding's commit. A request that went out with
 * the placeholder after a reopen would make Pi declare the tools again, which
 * breaks the prompt cache (H0, `test/platform/hash-port/save-install.test.ts`).
 */
import {
  type AgentChange,
  type Conversation,
  type Extension,
  type Harness,
  type Registry,
} from "@earendil-works/pi-durable";
import * as v from "valibot";

import { brunchTools, vSdcpnInitialData } from "@hashintel/brunch-agent";

import {
  BrowserBindingDoc,
  browserCallExtension,
} from "../browser-call/browser-call";
import {
  createHashBrowserToolsExtension,
  createHashSaveExtension,
  hashBrowserToolDefinitions,
} from "../browser-call/hash-browser-tools";
import { createLedgerExtension } from "../ledger";
import { queryBasisExtension } from "../net-state/query-basis";
import { netViewSectionExtension } from "./hash-agent/net-view-section";
import { hashPromptExtension, hashSystemPrompt } from "./hash-agent/prompt";
import { readBackPruningExtension } from "./hash-agent/read-back-pruning";
import { hashSkillsExtension } from "./hash-agent/skills";
import { createHostBinding, type HostBinding } from "./host-binding";

import type { Context } from "@earendil-works/chord";

/** One open conversation, as `installBoundSave` reaches its Save. */
export type BoundSaveTarget = {
  readonly harness: Harness;
  readonly root: Conversation;
  readonly registry: Registry;
  readonly host: HostBinding;
};

export type HashAgent = {
  /** HASH's prompt, as the agent's first section renders it. */
  readonly systemPrompt: string;
  /**
   * Everything to install in one Harness's registry, built over that
   * Harness's host binding, Save as the placeholder. `browserCallExtension`
   * is installed for the browser-call tasks, not selected.
   */
  readonly extensions: (host: HostBinding) => readonly Extension[];
  /**
   * A conversation root's agent: the selected extensions. Pi stores only
   * their names and resolves them from each Harness's registry, so the
   * instances installed over that Harness's binding are the ones that run.
   * The server adds the model.
   */
  readonly agent: AgentChange & { readonly extensions: readonly Extension[] };
  /** The tools the browser runs, from the catalogue: their calls stream for the client's `onToolCall`. */
  readonly clientToolNames: ReadonlySet<string>;
  /** Replace the placeholder Save with the bound document's, when the conversation is bound. */
  readonly installBoundSave: (
    conversation: BoundSaveTarget,
    context: Context,
  ) => Promise<void>;
};

/**
 * The extensions a conversation selects, over its Harness's host binding, in
 * order: the prompt and the skill catalogue lead the sections, `net_view`
 * follows them. Each model request is the stored effective context plus
 * these sections: no hook rewrites a request or refuses a call. The pruning
 * hook writes the read-back pruning after each tool round; the `net_view`
 * section restores the model's last view in the baseline Pi writes after a
 * compaction.
 */
const selectedExtensions = (host: HostBinding): readonly Extension[] => [
  hashPromptExtension,
  hashSkillsExtension,
  createLedgerExtension(host),
  createHashBrowserToolsExtension(host),
  createHashSaveExtension(host),
  readBackPruningExtension(host),
  queryBasisExtension(host, { name: brunchTools.ledgerQueryBasis }),
  netViewSectionExtension(host),
];

/** The bound document's ID, from the conversation's committed binding; none while unbound. */
const boundDocumentId = async (
  harness: Harness,
  root: Conversation,
  context: Context,
) => {
  const stored = (await harness.snapshot(BrowserBindingDoc, root.id, context))
    ?.binding;
  if (stored === null || stored === undefined) return undefined;
  return v.parse(vSdcpnInitialData, {
    binding: JSON.parse(stored) as unknown,
  })?.binding.documentId;
};

export const createHashAgent = (): HashAgent => ({
  systemPrompt: hashSystemPrompt,
  extensions: (host) => [...selectedExtensions(host), browserCallExtension],
  // Never bound: only the names of these instances are stored.
  agent: { extensions: selectedExtensions(createHostBinding()) },
  clientToolNames: new Set(
    hashBrowserToolDefinitions().map(({ name }) => name),
  ),
  installBoundSave: async ({ harness, root, registry, host }, context) => {
    const documentId = await boundDocumentId(harness, root, context);
    if (documentId !== undefined)
      registry.install(createHashSaveExtension(host, documentId));
  },
});
