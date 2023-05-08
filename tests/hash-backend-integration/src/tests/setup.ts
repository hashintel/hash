import { promises as fs } from "node:fs";

import { GraphStatus } from "@apps/hash-graph/type-defs/status";
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

export const restoreSnapshot = (snapshotPath: string) => {
  return fs
    .readFile(snapshotPath)
    .then((snapshot) =>
      fetch("http://localhost:4001/snapshot", {
        method: "POST",
        body: snapshot,
      }),
    )
    .then(async (response) => {
      const status: GraphStatus = await response.json();
      if (status.code !== "OK") {
        if (status.message) {
          throw new Error(`Snapshot restoration error: ${status.message}`);
        } else {
          throw new Error(`Snapshot restoration failed with unknown error`);
        }
      }
    });
};
