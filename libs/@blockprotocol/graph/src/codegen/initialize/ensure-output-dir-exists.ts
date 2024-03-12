import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { InitializeContext } from "../context/initialize.js";

export const ensureOutputDirExists = async (
  context: InitializeContext,
): Promise<void> => {
  context.logDebug("Checking target directory exists");

  const resolvedTargetDir = path.resolve(context.parameters.outputFolder);

  try {
    // Check the file exists
    await fs.stat(resolvedTargetDir);
    context.logTrace(`Target directory ${resolvedTargetDir} already existed`);
  } catch (_) {
    context.logTrace(
      `Target directory ${resolvedTargetDir} didn't exist, creating..`,
    );
    // If it doesn't, try and create it
    await fs.mkdir(resolvedTargetDir, { recursive: true });
  }
};
