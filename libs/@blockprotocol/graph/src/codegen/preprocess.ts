import type { PreprocessContext } from "./context.js";
import { identifyLinkEntityTypes } from "./preprocess/identify-link-entity-types.js";
import { removeEmptyAllOfs } from "./preprocess/remove-empty-all-ofs.js";
import { removeRedundantDataTypeInheritance } from "./preprocess/remove-redundant-data-type-inheritance.js";
import { rewriteTypeTitles } from "./preprocess/transform-type-titles.js";

export const preprocess = (context: PreprocessContext) => {
  rewriteTypeTitles(context);
  removeEmptyAllOfs(context);
  removeRedundantDataTypeInheritance(context);
  identifyLinkEntityTypes(context);
  /* @todo - if properties are empty, remove the `allOf` */
};
