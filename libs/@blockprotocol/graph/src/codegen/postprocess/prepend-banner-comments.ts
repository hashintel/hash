import { mustBeDefined } from "../../shared/util/must-be-defined";
import { typedKeys } from "../../shared/util/typed-object-iter.js";
import type { PostprocessContext } from "../context/postprocess.js";

const bannerComment = () => `/**
 * This file was automatically generated – do not edit it.
 */

`;

export const prependBannerComments = (context: PostprocessContext) => {
  context.logDebug("Prepending banner comments");

  for (const file of typedKeys(context.filesToDependentIdentifiers)) {
    context.logTrace(`Prepending banner comment for ${file}`);
    context.filesToContents[file] =
      bannerComment() + mustBeDefined(context.filesToContents[file]);
  }
};
