import type { PostprocessContext } from "./context/postprocess.js";
import { allocateTypesToFiles } from "./postprocess/allocate-types-to-files.js";
import { appendIdentifierDefinitionsToFileContents } from "./postprocess/append-identifier-definitions-to-file-contents.js";
import { generateBlockEntityTypeAliases } from "./postprocess/generate-block-entity-type-aliases.js";
import { generateBlockLinkTargetAliases } from "./postprocess/generate-block-link-target-aliases";
import { generateEntityDefinitions } from "./postprocess/generate-entity-definitions.js";
import { generateLinkAndTargetDefinitions } from "./postprocess/generate-link-and-target-definitions.js";
import { prepareFileContents } from "./postprocess/prepare-file-contents.js";
import { prependBannerComments } from "./postprocess/prepend-banner-comments.js";
import { prependImportsAndExports } from "./postprocess/prepend-imports-and-exports.js";
import { writeToFiles } from "./postprocess/write-to-files.js";

export const postprocess = async (context: PostprocessContext) => {
  allocateTypesToFiles(context);
  prepareFileContents(context);
  generateEntityDefinitions(context);
  generateLinkAndTargetDefinitions(context);
  generateBlockEntityTypeAliases(context);
  generateBlockLinkTargetAliases(context);
  appendIdentifierDefinitionsToFileContents(context);
  prependImportsAndExports(context);
  prependBannerComments(context);

  /* @todo - Modify the generated docs of types to include the URLs they came from */
  /* @todo - Move documentation from the `Properties` definition to the `Entity` definition */
  /* @todo - Generate mappings of TypeURLs to prettified names (fallback to camelCased title if not overriden) */

  await writeToFiles(context);
};
