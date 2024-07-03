import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { InitializeContext } from "../context/initialize.js";

export const cleanOutputDir = async (
  context: InitializeContext,
): Promise<void> => {
  context.logDebug("Cleaning target dir");

  const resolvedTargetDir = path.resolve(context.parameters.outputFolder);
  const promises = [];
  for (const dirContents of await fs.readdir(resolvedTargetDir)) {
    const dirContentsPath = path.resolve(resolvedTargetDir, dirContents);
    context.logTrace(`Removing ${dirContentsPath} from ${resolvedTargetDir}..`);
    promises.push(fs.rm(dirContentsPath, { recursive: true }));
  }
  await Promise.all(promises);
};
