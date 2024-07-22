import type { PostprocessContext } from "../context/postprocess.js";
import { sharedMetadataSchemas } from "../shared.js";

/**
 * Detect the use of specific metadata types in the file and add them to the file's dependencies.
 * Must happen:
 * - after identifier definitions have been added to the file contents, as it depends on checking the source.
 * - before imports and exports are added
 */
export const addMetadataDependenciesToFiles = (context: PostprocessContext) => {
  for (const [file, contents] of Object.entries(context.filesToContents)) {
    for (const schema of sharedMetadataSchemas) {
      if (contents.match(new RegExp(`\\b${schema.title}\\b`))) {
        context.logTrace(
          `Adding dependent identifier ${schema.title} to file ${file}`,
        );
        context.addDependentIdentifierInFile(schema.title, file);
      }
    }
  }
};
