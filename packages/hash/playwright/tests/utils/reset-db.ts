import execa from "execa";
import { monorepoRootDir } from "@hashintel/hash-backend-utils/environment";

export const resetDb = async () => {
  await execa("yarn", ["seed-data"], {
    cwd: monorepoRootDir,
  });
};
