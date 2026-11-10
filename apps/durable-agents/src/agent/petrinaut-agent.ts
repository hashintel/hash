/**
 * A minimal Brunch agent for Petrinaut on Pi Durable: the Ledger, the
 * Petrinaut browser tools, `query_basis` and Brunch's system prompt. No
 * Voice, interview budget, skills or Ledger comments.
 *
 * A server installs `extensions` in its registry, creates a conversation's
 * root with `agent` (adding its model), and binds the conversation to the
 * browser's editor with `bindBrowserDocument` so claims can prove the binding.
 */
import { readFileSync } from "node:fs";

import {
  type AgentChange,
  defineExtension,
  type Extension,
  section,
} from "@earendil-works/pi-durable";

import { browserCallExtension } from "../browser-call/browser-call";
import { petrinautBrowserToolsExtension } from "../browser-call/petrinaut-browser-tools";
import { ledgerExtension } from "../ledger";
import { queryBasisExtension } from "../net-state/query-basis";
import { contextProjectionExtension } from "./petrinaut-agent/context-projection";
import { toolAdmissionExtension } from "./petrinaut-agent/tool-admission";

/**
 * Copied from `apps/brunch-agent/src/agents/petrinaut/prompts/system.md`,
 * which no package exports, less what this agent does not mount: the skill
 * loading, `ledger_compile` and Ledger comments.
 */
export const petrinautSystemPrompt = readFileSync(
  new URL("petrinaut-agent/system-prompt.md", import.meta.url),
  "utf8",
).trim();

const petrinautPromptExtension = defineExtension({
  name: "brunch.petrinaut",
  sections: [
    section("brunch-petrinaut-system", () => petrinautSystemPrompt, {
      tag: false,
    }),
  ],
});

export type PetrinautAgent = {
  /** Brunch's prompt, as the agent's first section renders it. */
  readonly systemPrompt: string;
  /**
   * Everything to install in the registry. `browserCallExtension` is
   * installed for the browser-call tasks, not selected.
   */
  readonly extensions: readonly Extension[];
  /** A conversation root's agent: the selected extensions. The server adds the model. */
  readonly agent: AgentChange & { readonly extensions: readonly Extension[] };
};

export const createPetrinautAgent = (): PetrinautAgent => {
  const selected = [
    petrinautPromptExtension,
    ledgerExtension,
    petrinautBrowserToolsExtension,
    contextProjectionExtension,
    toolAdmissionExtension,
    queryBasisExtension,
  ];
  return {
    systemPrompt: petrinautSystemPrompt,
    extensions: [...selected, browserCallExtension],
    agent: { extensions: selected },
  };
};
