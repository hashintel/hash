import type { PostprocessContext } from "../context/postprocess.js";

/**
 * Adds 'as VersionedUrl' to versioned URLs in the file.
 */
export const assertVersionedUrls = (context: PostprocessContext) => {
  for (const [file, contents] of Object.entries(context.filesToContents)) {
    const rewrittenContents = contents.replaceAll(
      /\/v\/\d+"/g,
      "$& as VersionedUrl",
    );

    if (rewrittenContents !== contents) {
      context.logTrace(`Adding VersionedUrl import to file ${file}`);

      const importStatement = `import type { VersionedUrl } from "@blockprotocol/type-system/slim";`;

      context.filesToContents[file] =
        `${importStatement}\n${context.filesToContents[file]}`;
    }
  }
};
