import { typedKeys } from "../../util/typed-object-iter.js";
import type { PostprocessContext } from "../context/postprocess.js";

export const prepareFileContents = (context: PostprocessContext) => {
  context.logDebug("Preparing file contents");

  for (const file of typedKeys(context.filesToDependentIdentifiers)) {
    context.logTrace(`Generating empty contents for ${file}`);
    context.filesToContents[file] = "";
  }
};
