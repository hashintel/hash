import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The non-workspace root shared by Brunch packages and evaluation assets. */
export const CONTEXT_ROOT = fileURLToPath(
  new URL("../../../..", import.meta.url),
).replace(/[/\\]$/, "");

/**
 * Pruned jobs copy these non-workspace paths explicitly. Skip the affected
 * tests instead of failing opaquely if that CI contract drifts.
 */
export const contextRootPresent =
  existsSync(join(CONTEXT_ROOT, "docs")) &&
  existsSync(join(CONTEXT_ROOT, "scripts"));
