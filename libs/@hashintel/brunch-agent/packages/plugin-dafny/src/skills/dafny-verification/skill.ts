import { skillFromMarkdown } from "@hashintel/brunch-agent/flue";

import skillMarkdown from "./SKILL.md?raw";

export const DAFNY_VERIFICATION_SKILL_NAME = "dafny-verification";

/** Stub job skill: a placeholder home with no supporting resources yet. */
export const dafnyVerificationSkill = skillFromMarkdown(skillMarkdown);
