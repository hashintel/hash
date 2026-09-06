import { useModel, useSkill } from "@flue/runtime";

import systemPrompt from "./prompts/SYSTEM.md?raw";
import {
  ELICITATION_SKILL_NAME,
  elicitationSkill,
} from "./skills/elicitation/skill";
import { skillFromMarkdown } from "./skills/skill-markdown";

/**
 * Mount the contributions owned by Brunch core and return its system prompt.
 *
 * Core contributes the always-on universal prompt and one `elicitation`
 * capability skill. It owns no model-facing tool; add one here only when it
 * applies independently of the selected modelling formalism and host.
 */
export function useBrunchAgent(model: string): string {
  useModel(model);
  useSkill(elicitationSkill);
  return systemPrompt.replace(/^\s+|\s+$/gu, "");
}

export { ELICITATION_SKILL_NAME, elicitationSkill, skillFromMarkdown };
