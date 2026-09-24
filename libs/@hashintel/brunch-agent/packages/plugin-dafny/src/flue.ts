import { useInstruction, useSkill } from "@flue/runtime";

import dafnyVerificationSkill from "@hashintel/brunch-agent-plugin-dafny/skills/dafny-verification/SKILL.md";

import dafnyAppend from "./prompts/APPEND_SYSTEM.md?raw";

/**
 * Mount the stub prompt material and skill owned by the Dafny plugin.
 *
 * Not composed by any application. Tools are added only when a real Dafny
 * capability exists.
 */
export function useDafnyPlugin(): void {
  useInstruction(dafnyAppend.trim());
  useSkill(dafnyVerificationSkill);
}

export const DAFNY_VERIFICATION_SKILL_NAME = dafnyVerificationSkill.name;
export { dafnyVerificationSkill };
