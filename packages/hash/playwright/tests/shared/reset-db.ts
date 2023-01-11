import { monorepoRootDir } from "@hashintel/hash-backend-utils/environment";
import execa from "execa";

export const resetDb = async () => {
  await execa("yarn", ["seed-data"], {
    cwd: monorepoRootDir,
  });
};
