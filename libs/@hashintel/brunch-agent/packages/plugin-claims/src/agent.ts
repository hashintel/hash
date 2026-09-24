import { useInstruction, useSkill } from "@flue/runtime";

import claimsFormalizationSkill from "@hashintel/brunch-agent-plugin-claims/skills/claims-formalization/SKILL.md";

import claimsAppend from "./prompts/APPEND_SYSTEM.md?raw";

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

export const CLAIMS_FORMALIZATION_SKILL_NAME = claimsFormalizationSkill.name;
export { claimsFormalizationSkill };
