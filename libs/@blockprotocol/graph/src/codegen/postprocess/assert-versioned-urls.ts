import type { PostprocessContext } from "../context/postprocess.js";

/**
 * Adds '& VersionedUrl' to versioned URLs in the file (this is a branded type in the type system, we cannot rely on the string alone).
 */
export const assertVersionedUrls = (context: PostprocessContext) => {
  for (const [file, contents] of Object.entries(context.filesToContents)) {
    /**
     * Rewrite dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1" to add & VersionedUrl
     *
     * Adding & VersionedUrl to entityTypeIds is handled in generate-entity-definitions.ts
     */
    const rewrittenContents = contents.replace(
      /dataTypeId:\s*"([^"]*\/v\/\d+)"/g,
      'dataTypeId: "$1" & VersionedUrl',
    );

    if (rewrittenContents.includes("& VersionedUrl")) {
      context.logTrace(`Adding VersionedUrl import to file ${file}`);

      const importStatement = `import type { VersionedUrl } from "@blockprotocol/type-system/slim";`;

      context.filesToContents[file] =
        `${importStatement}\n${rewrittenContents}`;
    }
  }
};
