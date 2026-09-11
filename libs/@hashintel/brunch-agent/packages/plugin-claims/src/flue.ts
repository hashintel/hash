import { useInstruction, useSkill } from "@flue/runtime";

import claimsAppend from "./prompts/APPEND_SYSTEM.md?raw";
import {
  CLAIMS_FORMALIZATION_SKILL_NAME,
  claimsFormalizationSkill,
} from "./skills/claims-formalization/skill";

/**
 * Mount the prompt material and skill owned by the claims plugin.
 *
 * Not composed by any application. Tools are added only when a real ledger
 * capability exists.
 */
export function useClaimsPlugin(): void {
  useInstruction(claimsAppend.trim());
  useSkill(claimsFormalizationSkill);
}

export { CLAIMS_FORMALIZATION_SKILL_NAME, claimsFormalizationSkill };
