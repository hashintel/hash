import { monorepoRootDir } from "@local/hash-backend-utils/environment";
import execa from "execa";

export const recreateDbAndRunSchemaMigrations = async () => {
  await execa(
    "yarn",
    ["workspace", "@hashintel/hash-datastore", "pg:recreate-db"],
    {
      cwd: monorepoRootDir,
    },
  );

  await execa(
    "yarn",
    ["workspace", "@hashintel/hash-datastore", "pg:migrate", "up"],
    { cwd: monorepoRootDir },
  );
};
