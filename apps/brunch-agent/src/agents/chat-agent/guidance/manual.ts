import { useInstruction, useModel, useSkill, useTool } from "@flue/runtime";

import experimentDrafting from "./manual/experiment-drafting.md?raw";
import feedback from "./manual/feedback.md?raw";
import identityLedger from "./manual/identity-ledger.md?raw";
import { createLedgerTools } from "./manual/ledger-tools.ts";
import petrinautCapability from "./manual/petrinaut-capability.md?raw";
import queryBasis from "./manual/query-basis.md?raw";
import runtimeBound from "./manual/runtime-bound.md?raw";
import runtimeUnbound from "./manual/runtime-unbound.md?raw";
import constructing from "./manual/skills/constructing/SKILL.md";
import eliciting from "./manual/skills/eliciting/SKILL.md";
import system from "./manual/system.md?raw";

import type { LedgerHistory } from "./manual/ledger.ts";

/**
 * A hand-edited arm, copied from `identity` as of round 4c. Everything the
 * model reads and every tool it uses to keep the Ledger comes from `manual/`:
 * instructions, skills, the Ledger tools with their schema, refusals,
 * coverage and map, and the runtime instructions it hands back for the agent
 * to mount in their usual places.
 */
export const useManualGuidance = (
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
