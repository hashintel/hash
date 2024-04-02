import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv-flow";
import waitOn from "wait-on";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const monorepoRootDir = path.resolve(__dirname, "../../../..");

config({ silent: true, path: monorepoRootDir });

/**
 * Get a required environment variable. Throws an error if it's not set.
 *
 * @todo Replace with https://www.npmjs.com/package/envalid
 */
export const getRequiredEnv = (name: string) => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
};

export const waitOnResource = async (
  resource: string,
  logger?: Pick<Console, "debug">,
) => {
  logger?.debug(`Waiting on ${resource}...`);

  await waitOn({
    resources: [resource],
    timeout: 30000,
  });

  logger?.debug(`${resource} is ready`);
};

export const realtimeSyncEnabled = process.env.ENABLE_REALTIME_SYNC === "true";
