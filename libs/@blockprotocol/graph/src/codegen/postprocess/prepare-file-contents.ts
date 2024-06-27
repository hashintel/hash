import { typedKeys } from "../../util/typed-object-iter";
import type { PostprocessContext } from "../context/postprocess";

export const prepareFileContents = (context: PostprocessContext) => {
  context.logDebug("Preparing file contents");

  for (const file of typedKeys(context.filesToDependentIdentifiers)) {
    context.logTrace(`Generating empty contents for ${file}`);
    context.filesToContents[file] = "";
  }
};
