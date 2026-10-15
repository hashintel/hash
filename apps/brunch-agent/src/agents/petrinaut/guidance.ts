import { useModel, useSkill, useTool } from "@flue/runtime";

import system from "./prompts/system.md?raw";
import eliciting from "./skills/eliciting/SKILL.md";
import modelling from "./skills/modelling/SKILL.md";
import petrinaut from "./skills/petrinaut/SKILL.md";
import { createLedgerTools } from "./tools/ledger.ts";
import { createQueryBasisTool } from "./tools/query-basis.ts";

import type { LedgerHistory } from "@hashintel/brunch-agent";

/**
 * Everything the model reads, and every tool that writes or reads the Ledger.
 * It mounts no instruction besides the system prompt: Petrinaut, runtime,
 * experiment and `query_basis` guidance live in the skills and tool
 * descriptions instead.
 */
export const useGuidance = (
  model: string,
  options: Parameters<typeof useModel>[1],
  readHistory: () => Promise<LedgerHistory>,
) => {
  useModel(model, options);
  useSkill(eliciting);
  useSkill(modelling);
  useSkill(petrinaut);
  for (const tool of createLedgerTools(readHistory)) useTool(tool);
  return {
    system: system.trim(),
    createQueryBasisTool,
  };
};
