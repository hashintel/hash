import { useInstruction, useModel, useSkill, useTool } from "@flue/runtime";

import { createLedgerTools } from "../petrinaut/tools/ledger.ts";
import { createQueryBasisTool } from "../petrinaut/tools/query-basis.ts";
import { interviewBudgetInstruction } from "./interview-budget-instruction.ts";
import system from "./prompts/system.md?raw";
import eliciting from "./skills/eliciting/SKILL.md";
import modelling from "./skills/modelling/SKILL.md";
import petrinaut from "./skills/petrinaut/SKILL.md";
import { wordsInstruction } from "./words-instruction.ts";

import type {
  LedgerHistory,
  PetrinautSubmissionContext,
} from "@hashintel/brunch-agent";

/**
 * Everything the model reads, and every tool that writes or reads the Ledger.
 * Besides the system prompt it mounts an instruction only for host context, an
 * interview allowance or preferred spellings:
 * Petrinaut, runtime, experiment and `query_basis` guidance live in the skills
 * and tool descriptions instead.
 */
export const useGuidance = (
  model: string,
  options: Parameters<typeof useModel>[1],
  readHistory: () => Promise<LedgerHistory>,
  /** The current submission's allowance and the conversation's spellings. */
  hostContext: PetrinautSubmissionContext,
) => {
  useModel(model, options);
  // Flue instructions are conditional contributions, not React hook slots;
  // an empty instruction is invalid, so an absent one is omitted.
  for (const instruction of [
    interviewBudgetInstruction(hostContext.interviewBudget),
    wordsInstruction(hostContext.words ?? []),
  ])
    if (instruction) useInstruction(instruction);
  useSkill(eliciting);
  useSkill(modelling);
  useSkill(petrinaut);
  for (const tool of createLedgerTools(readHistory)) useTool(tool);
  return {
    system: system.trim(),
    createQueryBasisTool,
  };
};
