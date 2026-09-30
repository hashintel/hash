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
import constructing from "./guidance/skills/constructing/SKILL.md";
import eliciting from "./guidance/skills/eliciting/SKILL.md";
import system from "./guidance/system.md?raw";

import type { GuidanceVariant } from "./guidance-variant.ts";

const withFields = (description: string) =>
  `${description}\n\n${ledgerFields.trim()}`;

/**
 * A single guidance owner per run. The category-addressed arms share one
 * Ledger implementation; `identity` swaps in the identity-addressed Ledger,
 * which is always typed, and otherwise matches `feedback`.
 */
export const useChatGuidance = (
  variant: GuidanceVariant,
  model: string,
  options: Parameters<typeof useBrunchAgent>[1],
  ledger: LedgerServices,
): string => {
  if (variant === "baseline") return useBrunchAgent(model, options, ledger);
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
  return system.trim();
};
