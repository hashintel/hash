import type { InitializeContext } from "./context/initialize";
import { cleanOutputDir } from "./initialize/clean-output-dir";
import { ensureOutputDirExists } from "./initialize/ensure-output-dir-exists";
import { traverseAndCollateSchemas } from "./initialize/traverse-and-collate-schemas";

export const initialize = async (context: InitializeContext) => {
  await ensureOutputDirExists(context);
  await cleanOutputDir(context);
  await traverseAndCollateSchemas(context);
};
