import { defineSkill } from "@flue/runtime";

import { universalElicitationReference } from "@hashintel/brunch-agent/flue";

import checks from "./checks.md?raw";
import instructions from "./instructions.md?raw";
import pnConstruction from "./pn-construction.md?raw";
import profile from "./profile.md?raw";
import workpieceTemplate from "./workpiece-template.md?raw";

export const SDCPN_MODELLING_SKILL_NAME = "sdcpn-modelling";

/** One job skill composed from separately authored core and plugin resources. */
export const sdcpnModellingSkill = defineSkill({
  name: SDCPN_MODELLING_SKILL_NAME,
  description:
    "Elicit, review, or revise an operational process model, maintain its recoverable workpiece, and construct an inspected SDCPN when Petrinaut capabilities are available. Use for process-modelling interviews, Petri nets, and analysis or revision of either artifact.",
  instructions,
  files: {
    "references/checks.md": checks,
    "references/pn-construction.md": pnConstruction,
    "references/profile.md": profile,
    "references/universal-elicitation.md": universalElicitationReference,
    "templates/workpiece.md": workpieceTemplate,
  },
});
