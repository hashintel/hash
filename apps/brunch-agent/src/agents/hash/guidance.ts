import { useInstruction, useModel, useSkill, useTool } from "@flue/runtime";

import { createLedgerAppend, createOrigin } from "@hashintel/brunch-agent";

import { interviewBudgetInstruction } from "../petrinaut/interview-budget-instruction.ts";
import { createLedgerTools } from "../petrinaut/tools/ledger.ts";
import { createQueryBasisTool } from "../petrinaut/tools/query-basis.ts";
import { wordsInstruction } from "../petrinaut/words-instruction.ts";
import system from "./prompts/system.md?raw";
import eliciting from "./skills/eliciting/SKILL.md";
import hashGraph from "./skills/hash-graph/SKILL.md";
import modelling from "./skills/modelling/SKILL.md";
import petrinaut from "./skills/petrinaut/SKILL.md";

import type {
  LedgerHistory,
  PetrinautSubmissionContext,
} from "@hashintel/brunch-agent";

/** The `evidenced` origin here: what the agent reads from HASH counts too. */
export const hashEvidencedDescription =
  "It is in material the USER shared, such as a log or a document, or in records of the USER's own organisation that the agent read from HASH. What a tool computed, such as a run or an optimization, is not evidence for the account: record what it showed in a reflection.";

const ledgerAppend = createLedgerAppend(createOrigin(hashEvidencedDescription));

/**
 * Everything the model reads, and every tool that writes or reads the Ledger.
 * Besides the system prompt it mounts an instruction only for host context, an
 * interview allowance or preferred spellings:
 * Petrinaut, HASH graph, runtime, experiment and `query_basis` guidance live
 * in the skills and tool descriptions instead.
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
  useSkill(hashGraph);
  for (const tool of createLedgerTools(readHistory, ledgerAppend))
    useTool(tool);
  return {
    system: system.trim(),
    createQueryBasisTool,
  };
};
