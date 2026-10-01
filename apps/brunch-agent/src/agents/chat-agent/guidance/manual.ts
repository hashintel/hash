import { useInstruction, useModel, useSkill, useTool } from "@flue/runtime";

import {
  createIdentityLedgerCommitTool,
  createIdentityLedgerCompileTool,
  renderVocabulary,
  type LedgerServices,
} from "@hashintel/brunch-agent";

import feedback from "./manual/feedback.md?raw";
import identityLedger from "./manual/identity-ledger.md?raw";
import ledgerCommit from "./manual/ledger-commit.md?raw";
import ledgerCompile from "./manual/ledger-compile.md?raw";
import ledgerFields from "./manual/ledger-fields.md?raw";
import { ledgerVocabulary } from "./manual/ledger-vocabulary.ts";
import constructing from "./manual/skills/constructing/SKILL.md";
import eliciting from "./manual/skills/eliciting/SKILL.md";
import system from "./manual/system.md?raw";

import type { useBrunchAgent } from "@hashintel/brunch-agent/flue";

/**
 * A hand-edited arm, copied from `identity` as of round 4c. Everything the
 * model reads comes from `manual/`, so editing it changes no other arm; the
 * Ledger's behaviour (schema, coverage, needs) stays the shared package's.
 */
export const useManualGuidance = (
  model: string,
  options: Parameters<typeof useBrunchAgent>[1],
  ledger: LedgerServices,
): string => {
  useModel(model, options);
  useSkill(eliciting);
  useSkill(constructing);
  const services = {
    vocabulary: ledgerVocabulary,
    readHistory: ledger.readHistory,
  };
  useTool({
    ...createIdentityLedgerCommitTool(services),
    description: [
      ledgerCommit.trim(),
      renderVocabulary(ledgerVocabulary),
      ledgerFields.trim(),
    ].join("\n\n"),
  });
  useTool({
    ...createIdentityLedgerCompileTool(services),
    description: ledgerCompile.trim(),
  });
  useInstruction(feedback.trim());
  useInstruction(identityLedger.trim());
  return system.trim();
};
