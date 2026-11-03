// oxlint-disable import/max-dependencies -- the preview names one component for each element a generated page holds
import defaultMdxComponents from "@fumadocs/base-ui/mdx";
import { Struct } from "effect";

import { ApiCode } from "./api-code.js";
import { ApiContents } from "./api-contents.js";
import { ApiDeprecation } from "./api-deprecation.js";
import { ApiExport } from "./api-export.js";
import { ApiHierarchy } from "./api-hierarchy.js";
import { ApiIndexRow } from "./api-index-row.js";
import { ApiIndex } from "./api-index.js";
import { ApiLink } from "./api-link.js";
import { ApiMember } from "./api-member.js";
import { ApiMembers } from "./api-members.js";
import { ApiMeta } from "./api-meta.js";
import { ApiPart } from "./api-part.js";
import { ApiRelations } from "./api-relations.js";
import { ApiSection } from "./api-section.js";

import type * as Components from "../../lib/components.js";

/** The preview's drawing of generated pages, in fumadocs' own style. A host passes its own. */
export const components: Components.Components = {
  Export: ApiExport,
  Part: ApiPart,
  Deprecation: ApiDeprecation,
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

/** The preview's drawing of the plain HTML elements of generated pages: fumadocs' own, with a link that colours the name of an export by its kind. */
// oxlint-disable-next-line id-length -- the key is the element's tag name
export const html = Struct.assign(defaultMdxComponents, { a: ApiLink });
