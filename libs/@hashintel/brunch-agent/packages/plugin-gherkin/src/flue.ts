import { useInstruction, useSkill } from "@flue/runtime";

import gherkinAppend from "./prompts/APPEND_SYSTEM.md?raw";
import {
  GHERKIN_SPECIFICATION_SKILL_NAME,
  gherkinSpecificationSkill,
} from "./skills/gherkin-specification/skill";

/**
 * Mount the prompt material and skill owned by the Gherkin plugin.
 *
 * This contribution bundle is authored and packaged but not yet composed by
 * any application. It exists as the second pairing that pressure-tests the
 * core/plugin boundary; no parser, step-binding, or execution tool is earned
 * yet, so the bundle mounts no tools.
 */
export function useGherkinPlugin(): void {
  useInstruction(gherkinAppend.trim());
  useSkill(gherkinSpecificationSkill);
}

export { GHERKIN_SPECIFICATION_SKILL_NAME, gherkinSpecificationSkill };
