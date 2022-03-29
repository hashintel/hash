import execa from "execa";
import { monorepoRootDir } from "@hashintel/hash-backend-utils/environment";

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
    ["workspace", "@hashintel/hash-datastore", "pg:run-schema-migrations"],
    { cwd: monorepoRootDir },
  );
};
