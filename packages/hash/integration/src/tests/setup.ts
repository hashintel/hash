import execa from "execa";
import { monorepoRootDir } from "@hashintel/hash-backend-utils/environment";

export const recreateDbAndRunSchemaMigrations = async () => {
  await execa(
    "yarn",
    ["workspace", "@hashintel/hash-postgres", "recreate-db"],
    { cwd: monorepoRootDir },
  );

  await execa(
    "yarn",
    ["workspace", "@hashintel/hash-postgres", "run-schema-migrations"],
    { cwd: monorepoRootDir },
  );
};
