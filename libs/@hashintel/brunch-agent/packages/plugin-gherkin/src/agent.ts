import { useInstruction, useSkill } from "@flue/runtime";

import gherkinSpecificationSkill from "@hashintel/brunch-agent-plugin-gherkin/skills/gherkin-specification/SKILL.md";

import gherkinAppend from "./prompts/APPEND_SYSTEM.md?raw";

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

export const GHERKIN_SPECIFICATION_SKILL_NAME = gherkinSpecificationSkill.name;
export { gherkinSpecificationSkill };
