import { useModel, useSkill, useTool } from "@flue/runtime";

import system from "./manual/prompts/system.md?raw";
import eliciting from "./manual/skills/eliciting/SKILL.md";
import modelling from "./manual/skills/modelling/SKILL.md";
import petrinaut from "./manual/skills/petrinaut/SKILL.md";
import { createLedger2Tools } from "./manual/tools/ledger.ts";
import { createQueryBasisTool } from "./manual/tools/query-basis.ts";

import type { LedgerHistory } from "./manual/tools/ledger2/commits.ts";

/**
 * A hand-edited arm, copied from `identity` as of round 4c. Everything the
 * model reads and every tool that writes or reads the Ledger comes from
 * `manual/`. It mounts no instruction besides the system prompt: Petrinaut,
 * runtime, experiment and `query_basis` guidance live in its skills and tool
 * descriptions instead.
 */
export const useManualGuidance = (
  model: string,
  options: Parameters<typeof useModel>[1],
  readHistory: () => Promise<LedgerHistory>,
) => {
  useModel(model, options);
  useSkill(eliciting);
  useSkill(modelling);
  useSkill(petrinaut);
  for (const tool of createLedger2Tools(readHistory)) useTool(tool);
  return {
    system: system.trim(),
    // An empty set, unlike none, keeps every shared instruction unmounted.
    instructions: {},
    createQueryBasisTool,
  };
};
