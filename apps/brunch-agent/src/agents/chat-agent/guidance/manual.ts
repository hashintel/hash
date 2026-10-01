import { useInstruction, useModel, useSkill, useTool } from "@flue/runtime";

import {
  createIdentityLedgerCommitTool,
  createIdentityLedgerCompileTool,
  renderVocabulary,
  type LedgerServices,
} from "@hashintel/brunch-agent";

import { renderCoverage } from "./manual/coverage-renderer.ts";
import experimentDrafting from "./manual/experiment-drafting.md?raw";
import feedback from "./manual/feedback.md?raw";
import identityLedger from "./manual/identity-ledger.md?raw";
import ledgerCommit from "./manual/ledger-commit.md?raw";
import ledgerCompile from "./manual/ledger-compile.md?raw";
import ledgerFields from "./manual/ledger-fields.md?raw";
import { ledgerText } from "./manual/ledger-text.ts";
import { ledgerVocabulary } from "./manual/ledger-vocabulary.ts";
import petrinautCapability from "./manual/petrinaut-capability.md?raw";
import queryBasis from "./manual/query-basis.md?raw";
import runtimeBound from "./manual/runtime-bound.md?raw";
import runtimeUnbound from "./manual/runtime-unbound.md?raw";
import constructing from "./manual/skills/constructing/SKILL.md";
import eliciting from "./manual/skills/eliciting/SKILL.md";
import system from "./manual/system.md?raw";

import type { ChatGuidance } from "./shared/chat-guidance.ts";
import type { useBrunchAgent } from "@hashintel/brunch-agent/flue";

/**
 * A hand-edited arm, copied from `identity` as of round 4c. Everything the
 * model reads comes from `manual/`: instructions, tool and argument
 * descriptions, and how the commit receipt and the map render coverage. The
 * Ledger's semantics (what is stored, refused, and counted as met) stay the
 * shared package's.
 */
export const useManualGuidance = (
  model: string,
  options: Parameters<typeof useBrunchAgent>[1],
  ledger: LedgerServices,
): ChatGuidance => {
  useModel(model, options);
  useSkill(eliciting);
  useSkill(constructing);
  const services = {
    vocabulary: ledgerVocabulary,
    readHistory: ledger.readHistory,
    text: ledgerText,
    renderCoverage,
  };
  useTool({
    ...createIdentityLedgerCommitTool(services),
    description: [
      ledgerCommit.trim(),
      renderVocabulary(ledgerVocabulary, ledgerText),
      ledgerFields.trim(),
    ].join("\n\n"),
  });
  useTool({
    ...createIdentityLedgerCompileTool(services),
    description: ledgerCompile.trim(),
  });
  useInstruction(feedback.trim());
  useInstruction(identityLedger.trim());
  return {
    system: system.trim(),
    instructions: {
      bound: runtimeBound.trim(),
      unbound: runtimeUnbound.trim(),
      queryBasis: queryBasis.trim(),
      capability: petrinautCapability.trim(),
      experimentDrafting: experimentDrafting.trim(),
    },
  };
};
