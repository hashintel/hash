// oxlint-disable import/max-dependencies -- the preview names one component for each element a generated page holds
import { ApiCode } from "./api-code.js";
import { ApiContents } from "./api-contents.js";
import { ApiExport } from "./api-export.js";
import { ApiHierarchy } from "./api-hierarchy.js";
import { ApiIndexRow } from "./api-index-row.js";
import { ApiIndex } from "./api-index.js";
import { ApiMember } from "./api-member.js";
import { ApiMembers } from "./api-members.js";
import { ApiMeta } from "./api-meta.js";
import { ApiPart } from "./api-part.js";
import { ApiRelations } from "./api-relations.js";
import { ApiSection } from "./api-section.js";

import type { Components } from "../../lib/components.js";

/** The preview's drawing of generated pages, in fumadocs' own style. A host passes its own. */
export const components: Components = {
  Export: ApiExport,
  Part: ApiPart,
  Contents: ApiContents,
  Section: ApiSection,
  Code: ApiCode,
  Members: ApiMembers,
  Member: ApiMember,
  Index: ApiIndex,
  IndexRow: ApiIndexRow,
  Hierarchy: ApiHierarchy,
  Relations: ApiRelations,
  Meta: ApiMeta,
};
