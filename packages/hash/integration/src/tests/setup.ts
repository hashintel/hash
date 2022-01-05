import * as path from "path";
import execa from "execa";

export const recreateDbAndRunSchemaMigrations = async () => {
  const monorepoRoot = path.resolve(__dirname, "../../../../..");

  await execa(
    "yarn",
    ["workspace", "@hashintel/hash-postgres", "recreate-db"],
    { cwd: monorepoRoot },
  );

  await execa(
    "yarn",
    ["workspace", "@hashintel/hash-postgres", "run-schema-migrations"],
    { cwd: monorepoRoot },
  );
};
