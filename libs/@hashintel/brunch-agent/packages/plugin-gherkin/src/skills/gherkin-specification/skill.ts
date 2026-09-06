import { skillFromMarkdown } from "@hashintel/brunch-agent/flue";

import gherkinAuthoringAndChecks from "./references/gherkin-authoring-and-checks.md?raw";
import gherkinElicitation from "./references/gherkin-elicitation.md?raw";
import skillMarkdown from "./SKILL.md?raw";
import workpieceTemplate from "./templates/workpiece.md?raw";

export const GHERKIN_SPECIFICATION_SKILL_NAME = "gherkin-specification";

/** The plugin's one job skill: software-behavior elicitation, workpiece, and Gherkin authoring/checks. */
export const gherkinSpecificationSkill = skillFromMarkdown(skillMarkdown, {
  "references/gherkin-authoring-and-checks.md": gherkinAuthoringAndChecks,
  "references/gherkin-elicitation.md": gherkinElicitation,
  "templates/workpiece.md": workpieceTemplate,
});
