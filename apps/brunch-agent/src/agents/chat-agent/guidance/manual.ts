import { useModel, useSkill, useTool } from "@flue/runtime";

import petrinautCapability from "./manual/prompts/petrinaut-capability.md?raw";
import system from "./manual/prompts/system.md?raw";
import constructing from "./manual/skills/constructing/SKILL.md";
import eliciting from "./manual/skills/eliciting/SKILL.md";
import { createLedger2Tools } from "./manual/tools/ledger2/ledger-tools.ts";
import { createQueryBasisTool } from "./manual/tools/query-basis.ts";

import type { LedgerHistory } from "./manual/tools/ledger2/commits.ts";

/**
 * A hand-edited arm, copied from `identity` as of round 4c. Everything the
 * model reads and every tool that writes or reads the Ledger comes from
 * `manual/`. Its only mounted instruction besides the system prompt is the
 * Petrinaut capability text; runtime, experiment and `query_basis` guidance
 * live in its skills and tool descriptions instead.
 */
export const useManualGuidance = (
  model: string,
  options: Parameters<typeof useModel>[1],
  readHistory: () => Promise<LedgerHistory>,
) => {
  useModel(model, options);
  useSkill(eliciting);
  useSkill(constructing);
  for (const tool of createLedger2Tools(readHistory)) useTool(tool);
  return {
    system: system.trim(),
    instructions: { capability: petrinautCapability.trim() },
    createQueryBasisTool,
  };
};
