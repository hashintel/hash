import { writeFile } from "node:fs/promises";
import * as path from "node:path";

import type { PostprocessContext } from "../context/postprocess.js";

export const writeToFiles = async (
  context: PostprocessContext,
): Promise<void> => {
  context.logDebug("Writing generated contents to disk");

  const writeQueue: Promise<void>[] = [];

  const targetDir = path.resolve(context.parameters.outputFolder);

  for (const [file, contents] of Object.entries(context.filesToContents)) {
    context.logTrace(`Writing file ${file}`);

    const filePath = path.resolve(targetDir, file);
    // create a promise to write the contents to the file
    writeQueue.push(writeFile(filePath, contents));
  }

  await Promise.all(writeQueue);
};
