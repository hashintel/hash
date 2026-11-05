// oxlint-disable import/max-dependencies -- the preview draws each kind of element a generated page holds
import defaultMdxComponents from "@fumadocs/base-ui/mdx";
import { Struct } from "effect";

import { ApiAccessorHalf } from "./api-accessor-half.js";
import { ApiCaption } from "./api-caption.js";
import { ApiCode } from "./api-code.js";
import { ApiComment } from "./api-comment.js";
import { ApiContents } from "./api-contents.js";
import { ApiCustom } from "./api-custom.js";
import { ApiDeprecation } from "./api-deprecation.js";
import { ApiDescribed } from "./api-described.js";
import { ApiDescription } from "./api-description.js";
import { ApiError } from "./api-error.js";
import { ApiExample } from "./api-example.js";
import { ApiExplanation } from "./api-explanation.js";
import { ApiExport } from "./api-export.js";
import { ApiForm } from "./api-form.js";
import { ApiGroup } from "./api-group.js";
import { ApiHierarchy } from "./api-hierarchy.js";
import { ApiImport } from "./api-import.js";
import { ApiIndex } from "./api-index.js";
import { ApiLink } from "./api-link.js";
import { ApiMember } from "./api-member.js";
import { ApiMembers } from "./api-members.js";
import { ApiMeta } from "./api-meta.js";
import { ApiNamespace } from "./api-namespace.js";
import { ApiParameter } from "./api-parameter.js";
import { ApiParameters } from "./api-parameters.js";
import { ApiRelated } from "./api-related.js";
import { ApiRelation } from "./api-relation.js";
import { ApiRemarks } from "./api-remarks.js";
import { ApiReturns } from "./api-returns.js";
import { ApiRow } from "./api-row.js";
import { ApiSee } from "./api-see.js";
import { ApiSignature } from "./api-signature.js";
import { ApiSignatures } from "./api-signatures.js";
import { ApiThrow } from "./api-throw.js";
import { ApiThrows } from "./api-throws.js";
import { ApiTrait } from "./api-trait.js";
import { ApiTypeParameter } from "./api-type-parameter.js";
import { ApiTypeParameters } from "./api-type-parameters.js";

import type * as Components from "../../src/components.js";

/** The preview's drawing of generated pages, in fumadocs' own style. A host passes its own. Every member draws as one item, and so does each half of an accessor. */
export const components: Components.Components = {
  Meta: ApiMeta,
  Comment: ApiComment,
  Description: ApiDescription,
  Deprecation: ApiDeprecation,
  Remarks: ApiRemarks,
  Custom: ApiCustom,
  Example: ApiExample,
  Caption: ApiCaption,
  See: ApiSee,
  Import: ApiImport,
  Contents: ApiContents,
  Group: ApiGroup,
  Index: ApiIndex,
  Row: ApiRow,
  Export: ApiExport,
  Signatures: ApiSignatures,
  Signature: ApiSignature,
  Members: ApiMembers,
  Property: ApiMember,
  Method: ApiMember,
  Accessor: ApiMember,
  EnumMember: ApiMember,
  Getter: ApiAccessorHalf,
  Setter: ApiAccessorHalf,
  TypeParameters: ApiTypeParameters,
  TypeParameter: ApiTypeParameter,
  Parameters: ApiParameters,
  Parameter: ApiParameter,
  Returns: ApiReturns,
  Throws: ApiThrows,
  Throw: ApiThrow,
  Error: ApiError,
  Form: ApiForm,
  Described: ApiDescribed,
  Related: ApiRelated,
  Relation: ApiRelation,
  Namespace: ApiNamespace,
  Trait: ApiTrait,
  Explanation: ApiExplanation,
  Hierarchy: ApiHierarchy,
  Code: ApiCode,
};

/** The preview's drawing of the plain HTML elements of generated pages: fumadocs' own, with a link that colours the name of an export by its kind. */
// oxlint-disable-next-line id-length -- the key is the element's tag name
export const html = Struct.assign(defaultMdxComponents, { a: ApiLink });
