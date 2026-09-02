import { skillFromMarkdown } from "../skill-markdown";
import universalElicitation from "./references/universal-elicitation.md?raw";
import skillMarkdown from "./SKILL.md?raw";

export const ELICITATION_SKILL_NAME = "elicitation";

/** Core's one capability skill: universal, formalism-independent elicitation judgment. */
export const elicitationSkill = skillFromMarkdown(skillMarkdown, {
  "references/universal-elicitation.md": universalElicitation,
});
