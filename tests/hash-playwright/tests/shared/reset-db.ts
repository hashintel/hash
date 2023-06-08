import { monorepoRootDir } from "@local/hash-backend-utils/environment";
import execa from "execa";

// @todo reimplement this
export const resetDb = async () => {
  await execa("yarn", ["seed-data"], {
    cwd: monorepoRootDir,
  });
};
