import type { PreprocessContext } from "./context";
import { identifyLinkEntityTypes } from "./preprocess/identify-link-entity-types";
import { removeEmptyAllOfs } from "./preprocess/remove-empty-all-ofs";
import { rewriteTypeTitles } from "./preprocess/transform-type-titles";

export const preprocess = (context: PreprocessContext) => {
  rewriteTypeTitles(context);
  removeEmptyAllOfs(context);
  identifyLinkEntityTypes(context);
  /* @todo - if properties are empty, remove the `allOf` */
};
