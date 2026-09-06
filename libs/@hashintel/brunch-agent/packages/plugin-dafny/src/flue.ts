import { useInstruction, useSkill } from "@flue/runtime";

import dafnyAppend from "./prompts/APPEND_SYSTEM.md?raw";
import {
  DAFNY_VERIFICATION_SKILL_NAME,
  dafnyVerificationSkill,
} from "./skills/dafny-verification/skill";

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

export { DAFNY_VERIFICATION_SKILL_NAME, dafnyVerificationSkill };
