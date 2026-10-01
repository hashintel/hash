import { useInstruction, useModel, useSkill, useTool } from "@flue/runtime";

import {
  createIdentityLedgerCommitTool,
  createIdentityLedgerCompileTool,
  renderVocabulary,
  type LedgerServices,
} from "@hashintel/brunch-agent";

import { renderCoverage } from "./receipt/coverage-renderer.ts";
import experimentDrafting from "./receipt/experiment-drafting.md?raw";
import feedback from "./receipt/feedback.md?raw";
import identityLedger from "./receipt/identity-ledger.md?raw";
import ledgerCommit from "./receipt/ledger-commit.md?raw";
import ledgerCompile from "./receipt/ledger-compile.md?raw";
import ledgerFields from "./receipt/ledger-fields.md?raw";
import { ledgerText } from "./receipt/ledger-text.ts";
import { ledgerVocabulary } from "./receipt/ledger-vocabulary.ts";
import petrinautCapability from "./receipt/petrinaut-capability.md?raw";
import queryBasis from "./receipt/query-basis.md?raw";
import runtimeBound from "./receipt/runtime-bound.md?raw";
import runtimeUnbound from "./receipt/runtime-unbound.md?raw";
import constructing from "./receipt/skills/constructing/SKILL.md";
import eliciting from "./receipt/skills/eliciting/SKILL.md";
import system from "./receipt/system.md?raw";

import type { ChatGuidance } from "./shared/chat-guidance.ts";
import type { useBrunchAgent } from "@hashintel/brunch-agent/flue";

/**
 * `identity` as of round 4c, but each turn's question is chosen from the
 * commit receipt's needs, and the needs that read as noise are revised.
 * Everything the model reads comes from `receipt/`: instructions, tool and
 * argument descriptions, and how the commit receipt and the map render
 * coverage. The Ledger's semantics (what is stored, refused, and counted as
 * met) stay the shared package's.
 */
export const useReceiptGuidance = (
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
