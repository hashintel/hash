import { skillFromMarkdown } from "@hashintel/brunch-agent/flue";

import cardsAndStanding from "./references/cards-and-standing.md?raw";
import claimsElicitation from "./references/claims-elicitation.md?raw";
import skillMarkdown from "./SKILL.md?raw";
import workpieceTemplate from "./templates/workpiece.md?raw";

export const CLAIMS_FORMALIZATION_SKILL_NAME = "claims-formalization";

/** The plugin's one job skill: claims elicitation, workpiece, and card preparation. */
export const claimsFormalizationSkill = skillFromMarkdown(skillMarkdown, {
  "references/cards-and-standing.md": cardsAndStanding,
  "references/claims-elicitation.md": claimsElicitation,
  "templates/workpiece.md": workpieceTemplate,
});
