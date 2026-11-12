import { useInstruction, useModel, useSkill, useTool } from "@flue/runtime";

import {
  brunchTools,
  hashEvidencedDescription,
  vLedgerAppendWith,
  vOriginWith,
} from "@hashintel/brunch-agent";

import { interviewBudgetInstruction } from "../shared/interview-budget-instruction.ts";
import { createLedgerTools } from "../shared/ledger-tools.ts";
import { createQueryBasisTool } from "../shared/query-basis.ts";
import { wordsInstruction } from "../shared/words-instruction.ts";
import system from "./prompts/system.md?raw";
import eliciting from "./skills/eliciting/SKILL.md";
import hashGraph from "./skills/hash-graph/SKILL.md";
import modelling from "./skills/modelling/SKILL.md";
import petrinaut from "./skills/petrinaut/SKILL.md";

import type {
  LedgerHistory,
  PetrinautSubmissionContext,
} from "@hashintel/brunch-agent";

/** HASH's Ledger entries: what the agent reads from HASH counts as evidenced too. */
const ledgerAppend = vLedgerAppendWith(vOriginWith(hashEvidencedDescription));

/**
 * Everything the model reads, and every tool that writes or reads the Ledger.
 * Besides the system prompt it mounts an instruction only for host context, an
 * interview allowance or preferred spellings:
 * Petrinaut, HASH graph, runtime, experiment and `ledger_query_basis`
 * guidance live in the skills and tool descriptions instead. Its Ledger map
 * and basis query take HASH's names.
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
  for (const tool of createLedgerTools(
    readHistory,
    ledgerAppend,
    brunchTools.ledgerQuery,
  ))
    useTool(tool);
  return {
    system: system.trim(),
    createQueryBasisTool: (
      options: Omit<Parameters<typeof createQueryBasisTool>[0], "name">,
    ) =>
      createQueryBasisTool({ ...options, name: brunchTools.ledgerQueryBasis }),
  };
};
