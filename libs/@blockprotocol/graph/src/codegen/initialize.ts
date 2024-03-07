import { InitializeContext } from "./context/initialize.js";
import { cleanOutputDir } from "./initialize/clean-output-dir.js";
import { ensureOutputDirExists } from "./initialize/ensure-output-dir-exists.js";
import { traverseAndCollateSchemas } from "./initialize/traverse-and-collate-schemas.js";

export const initialize = async (context: InitializeContext) => {
  await ensureOutputDirExists(context);
  await cleanOutputDir(context);
  await traverseAndCollateSchemas(context);
};
