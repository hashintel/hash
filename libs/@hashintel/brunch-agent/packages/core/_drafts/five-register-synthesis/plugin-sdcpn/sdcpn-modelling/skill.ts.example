import { defineSkill } from "@flue/runtime";

import { universalElicitationReference } from "@hashintel/brunch-agent/flue";

import checks from "./checks.md?raw";
import instructions from "./instructions.md?raw";
import pnConstruction from "./pn-construction.md?raw";
import profile from "./profile.md?raw";
import workpieceTemplate from "./workpiece-template.md?raw";

/** One packaged skill composed explicitly from separately authored resources. */
export const sdcpnModellingSkill = defineSkill({
  name: "sdcpn-modelling",
  description:
    "Elicit or revise an operational process model, maintain its recoverable workpiece, and construct a checked SDCPN when Petrinaut capabilities are available.",
  instructions,
  files: {
    "references/checks.md": checks,
    "references/pn-construction.md": pnConstruction,
    "references/profile.md": profile,
    "references/universal-elicitation.md": universalElicitationReference,
    "templates/workpiece.md": workpieceTemplate,
  },
});
