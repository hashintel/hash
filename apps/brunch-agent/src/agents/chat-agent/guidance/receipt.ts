import { useInstruction, useModel, useSkill, useTool } from "@flue/runtime";

import experimentDrafting from "./receipt/experiment-drafting.md?raw";
import feedback from "./receipt/feedback.md?raw";
import identityLedger from "./receipt/identity-ledger.md?raw";
import { createLedgerTools } from "./receipt/ledger-tools.ts";
import petrinautCapability from "./receipt/petrinaut-capability.md?raw";
import queryBasis from "./receipt/query-basis.md?raw";
import runtimeBound from "./receipt/runtime-bound.md?raw";
import runtimeUnbound from "./receipt/runtime-unbound.md?raw";
import constructing from "./receipt/skills/constructing/SKILL.md";
import eliciting from "./receipt/skills/eliciting/SKILL.md";
import system from "./receipt/system.md?raw";

import type { LedgerHistory } from "./receipt/ledger.ts";

/**
 * `identity` as of round 4c, but each turn's question is chosen from the
 * commit receipt's needs, which it ranks nearest a goal first and caps at
 * five, and the needs that read as noise are revised. Like `manual`,
 * everything the model reads and every tool it uses to keep the Ledger comes
 * from `receipt/`.
 */
export const useReceiptGuidance = (
  model: string,
  options: Parameters<typeof useModel>[1],
  readHistory: () => Promise<LedgerHistory>,
) => {
  useModel(model, options);
  useSkill(eliciting);
  useSkill(constructing);
  for (const tool of createLedgerTools(readHistory)) useTool(tool);
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
