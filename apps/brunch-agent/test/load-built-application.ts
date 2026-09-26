import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { LoadedFlueNodeApplication } from "@flue/vite";

/** Shared built-artifact loader for integration tests; this does not run a model. */
export type BuiltBrunchApplication = Pick<
  LoadedFlueNodeApplication,
  "fetch" | "stop"
>;
type BuiltApplicationModule = {
  readonly loadFlueNodeApplication?: () => Promise<BuiltBrunchApplication>;
};
export const loadBuiltBrunchApplication =
  async (): Promise<BuiltBrunchApplication> => {
    // Not `import.meta.url`, which a jsdom test environment reports as http:.
    const applicationUrl = pathToFileURL(
      join(import.meta.dirname, "../dist/app.mjs"),
    ).href;
    const builtModule = (await import(
      applicationUrl
    )) as BuiltApplicationModule;
    if (!builtModule.loadFlueNodeApplication)
      throw new Error("dist/app.mjs does not export loadFlueNodeApplication");
    return builtModule.loadFlueNodeApplication();
  };
