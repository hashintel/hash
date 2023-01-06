import path from "node:path";

import dotenvExpand from "dotenv-expand";
import { config } from "dotenv-flow";

export const graphRootDir = path.resolve(__dirname, "../../../");

dotenvExpand.expand(config({ silent: true, path: graphRootDir }));

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
