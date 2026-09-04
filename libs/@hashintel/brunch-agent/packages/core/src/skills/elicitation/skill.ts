import { skillFromMarkdown } from "../skill-markdown";
import skillMarkdown from "./SKILL.md?raw";

export const ELICITATION_SKILL_NAME = "elicitation";

/** Core's one capability skill: universal, formalism-independent elicitation judgment. */
export const elicitationSkill = skillFromMarkdown(skillMarkdown);
