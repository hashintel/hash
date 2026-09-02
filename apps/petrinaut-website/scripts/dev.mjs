#!/usr/bin/env node
/**
 * The website's dev task. With `--with-optimizer-service` it also builds and
 * starts the local Petrinaut Optimizer, so the `/optimization` route runs
 * studies for real; every other argument goes to Vite.
 *
 *   turbo run dev --filter @apps/petrinaut-website -- --with-optimizer-service
 */
import { fileURLToPath } from "node:url";

import { runDevServerWithOptionalService } from "@local/petrinaut-optimizer-client/dev-service";

const appDirectory = fileURLToPath(new URL("..", import.meta.url));

process.exitCode = await runDevServerWithOptionalService({
  cliArguments: process.argv.slice(2),
  cwd: appDirectory,
  prepare: { command: "yarn", args: ["examples:generate"] },
  server: { command: "yarn", args: ["vite"] },
});
