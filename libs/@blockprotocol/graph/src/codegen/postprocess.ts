import type { PostprocessContext } from "./context/postprocess";
import { addMetadataDependenciesToFiles } from "./postprocess/add-metadata-dependencies-to-files";
import { allocateTypesToFiles } from "./postprocess/allocate-types-to-files";
import { appendIdentifierDefinitionsToFileContents } from "./postprocess/append-identifier-definitions-to-file-contents";
import { generateBlockEntityTypeAliases } from "./postprocess/generate-block-entity-type-aliases";
import { generateBlockLinkTargetAliases } from "./postprocess/generate-block-link-target-aliases";
import { generateEntityDefinitions } from "./postprocess/generate-entity-definitions";
import { generateLinkAndTargetDefinitions } from "./postprocess/generate-link-and-target-definitions";
import { prepareFileContents } from "./postprocess/prepare-file-contents";
import { prependBannerComments } from "./postprocess/prepend-banner-comments";
import { prependImportsAndExports } from "./postprocess/prepend-imports-and-exports";
import { writeToFiles } from "./postprocess/write-to-files";

export const postprocess = async (context: PostprocessContext) => {
  allocateTypesToFiles(context);
  prepareFileContents(context);
  generateEntityDefinitions(context);
  generateLinkAndTargetDefinitions(context);
  generateBlockEntityTypeAliases(context);
  generateBlockLinkTargetAliases(context);
  appendIdentifierDefinitionsToFileContents(context);
  addMetadataDependenciesToFiles(context);
  prependImportsAndExports(context);
  prependBannerComments(context);

  /* @todo - Generate mappings of TypeURLs to prettified names (fallback to camelCased title if not overriden) */

  await writeToFiles(context);
};
