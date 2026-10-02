import { useInstruction, useModel, useSkill, useTool } from "@flue/runtime";

import system from "./manual/prompts/system.md?raw";
import constructing from "./manual/skills/constructing/SKILL.md";
import eliciting from "./manual/skills/eliciting/SKILL.md";
import petrinautCapability from "./manual/skills/petrinaut-capability.md?raw";
import experimentDrafting from "./manual/tools/experiment-drafting.md?raw";
import { createLedgerTools } from "./manual/tools/ledger-tools.ts";
import { createQueryBasisTool } from "./manual/tools/query-basis-tool.ts";
import queryBasis from "./manual/tools/query-basis.md?raw";
import runtimeBound from "./manual/tools/runtime-bound.md?raw";
import runtimeUnbound from "./manual/tools/runtime-unbound.md?raw";

import type { LedgerHistory } from "./manual/tools/ledger.ts";

/**
 * A hand-edited arm, copied from `identity` as of round 4c. Everything the
 * model reads and every tool that writes or reads the Ledger comes from
 * `manual/`: instructions, skills, the Ledger tools with their schema,
 * refusals, coverage and map, and the runtime instructions and `query_basis`
 * it hands back for the agent to mount in their usual places.
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
  return {
    system: system.trim(),
    instructions: {
      bound: runtimeBound.trim(),
      unbound: runtimeUnbound.trim(),
      queryBasis: queryBasis.trim(),
      capability: petrinautCapability.trim(),
      experimentDrafting: experimentDrafting.trim(),
    },
    createQueryBasisTool,
  };
};
