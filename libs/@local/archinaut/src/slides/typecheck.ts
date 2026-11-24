/**
 * `archinaut slides check`: type-checks every deck with the slides root's
 * `tsconfig.json`, which `slides new` wrote. MDX slides are compiled, not
 * type-checked, as the docs pages are.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

export const typecheckDecks = (root: string): number => {
  const project = join(root, "tsconfig.json");
  if (!existsSync(project)) {
    throw new Error(
      `${project} is missing; \`archinaut slides new\` writes one, or copy it from another slides folder`,
    );
  }
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  const result = spawnSync(process.execPath, [tsc, "--noEmit", "-p", project], {
    stdio: "inherit",
  });
  return result.status ?? 1;
};
