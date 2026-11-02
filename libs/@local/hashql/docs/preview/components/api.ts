import { ApiCode } from "./api-code.js";
import { ApiExport } from "./api-export.js";
import { ApiSection } from "./api-section.js";

import type { Components } from "../../lib/components.js";

/** The preview's drawing of generated pages, in fumadocs' own style. A host passes its own. */
export const components: Components = {
  Export: ApiExport,
  Section: ApiSection,
  Code: ApiCode,
};
