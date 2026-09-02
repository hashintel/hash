import { skillFromMarkdown } from "@hashintel/brunch-agent/flue";

import checks from "./references/checks.md?raw";
import pnConstruction from "./references/pn-construction.md?raw";
import profile from "./references/profile.md?raw";
import skillMarkdown from "./SKILL.md?raw";
import workpieceTemplate from "./templates/workpiece.md?raw";

export const SDCPN_MODELLING_SKILL_NAME = "sdcpn-modelling";

/** The plugin's one job skill: operational-process elicitation, workpiece, construction, and checks. */
export const sdcpnModellingSkill = skillFromMarkdown(skillMarkdown, {
  "references/checks.md": checks,
  "references/pn-construction.md": pnConstruction,
  "references/profile.md": profile,
  "templates/workpiece.md": workpieceTemplate,
});
