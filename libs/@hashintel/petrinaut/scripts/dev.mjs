#!/usr/bin/env node
/**
 * Petrinaut's dev task: Storybook, with the editor built from source. With
 * `--with-optimizer-service` it also builds and starts the local Petrinaut
 * Optimizer, so the "With real optimizer" story runs studies for real; every
 * other argument goes to Storybook.
 *
 *   turbo run dev --filter @hashintel/petrinaut -- --with-optimizer-service
 */
import { fileURLToPath } from "node:url";

import { runDevServerWithOptionalService } from "@local/petrinaut-optimizer-client/dev-service";

const packageDirectory = fileURLToPath(new URL("..", import.meta.url));

process.exitCode = await runDevServerWithOptionalService({
  cliArguments: process.argv.slice(2),
  cwd: packageDirectory,
  server: { command: "yarn", args: ["storybook", "dev"] },
});
