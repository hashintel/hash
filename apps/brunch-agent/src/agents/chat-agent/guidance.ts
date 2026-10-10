import { useInstruction, useModel, useSkill, useTool } from "@flue/runtime";

import {
  createIdentityLedgerCommitTool,
  createIdentityLedgerCompileTool,
  createLedgerCommitTool,
  createLedgerCompileTool,
  type LedgerServices,
} from "@hashintel/brunch-agent";
import { useBrunchAgent } from "@hashintel/brunch-agent/flue";

import feedback from "./guidance/feedback.md?raw";
import identityLedger from "./guidance/identity-ledger.md?raw";
import ledgerFields from "./guidance/ledger-fields.md?raw";
import { ledgerVocabulary } from "./guidance/ledger-vocabulary.ts";
import { useManualGuidance } from "./guidance/manual.ts";
import { useReceiptGuidance } from "./guidance/receipt.ts";
import constructing from "./guidance/skills/constructing/SKILL.md";
import eliciting from "./guidance/skills/eliciting/SKILL.md";
import system from "./guidance/system.md?raw";

import type { GuidanceVariant } from "./guidance-variant.ts";
import type { ToolDefinition } from "@flue/runtime";
import type { FlueConversationSnapshot } from "@flue/sdk";
import type { BrowserContext } from "@hashintel/brunch-agent-plugin-sdcpn";

/**
 * What an arm hands back once it has mounted its model, skills, Ledger tools
 * and instructions. A self-contained arm also returns its own runtime
 * instructions and `query_basis`, which the agent and the SDCPN plugin mount
 * in place of the shared ones; an instruction it leaves out mounts nothing.
 */
export interface ChatGuidance {
  readonly system: string;
  readonly instructions?: {
    /** The ping and browser-tool policy in a document-bound conversation. */
    readonly bound?: string;
    /** The ping policy in a conversation without browser tools. */
    readonly unbound?: string;
    readonly queryBasis?: string;
    readonly capability?: string;
    readonly experimentDrafting?: string;
  };
  /** Mounted only in a document-bound conversation. */
  readonly createQueryBasisTool?: (options: {
    browser: BrowserContext;
    history: () => Promise<FlueConversationSnapshot>;
  }) => ToolDefinition;
}

const withFields = (description: string) =>
  `${description}\n\n${ledgerFields.trim()}`;

/**
 * A single guidance owner per run. The category-addressed arms share one
 * Ledger implementation; `identity` swaps in the identity-addressed Ledger,
 * which is always typed, and otherwise matches `feedback`. `manual` and
 * `receipt` are self-contained: each mounts only its own sources and its own
 * Ledger tools, and returns its copies of the runtime instructions and of
 * `query_basis`.
 */
export const useChatGuidance = (
  variant: GuidanceVariant,
  model: string,
  options: Parameters<typeof useBrunchAgent>[1],
  ledger: LedgerServices,
): ChatGuidance => {
  if (variant === "baseline")
    return { system: useBrunchAgent(model, options, ledger) };
  if (variant === "manual")
    return useManualGuidance(model, options, ledger.readHistory);
  if (variant === "receipt")
    return useReceiptGuidance(model, options, ledger.readHistory);
  useModel(model, options);
  useSkill(eliciting);
  useSkill(constructing);
  if (variant === "identity") {
    const services = {
      vocabulary: ledgerVocabulary,
      readHistory: ledger.readHistory,
    };
    const commit = createIdentityLedgerCommitTool(services);
    useTool({ ...commit, description: withFields(commit.description) });
    useTool(createIdentityLedgerCompileTool(services));
  } else {
    const commit = createLedgerCommitTool(ledger);
    useTool({
      ...commit,
      description:
        ledger.noteShape === "typed"
          ? withFields(commit.description)
          : commit.description,
    });
    useTool(createLedgerCompileTool(ledger));
  }
  if (variant !== "replacement") useInstruction(feedback.trim());
  if (variant === "identity") useInstruction(identityLedger.trim());
  return { system: system.trim() };
};
