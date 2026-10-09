import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { FlowDefinitionWithId } from "@local/hash-isomorphic-utils/flows/types";

/**
 * The flow definitions a migration seeds, as JSON: `<migration number>.json`, e.g. `032.json`.
 *
 * Migrations seed from these snapshots, not from the flows defined in code, so that replaying a migration writes
 * what it wrote when it was created. `generate-flow-definition-migration.ts` writes them, and
 * `seeded-flows.test.ts` checks that the latest snapshot of each flow matches its code.
 */
export const flowDefinitionSnapshotDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "flow-definition-snapshots",
);

/**
 * The flow definitions a migration seeds. They aren't validated: a migration writes its snapshot as it was, even if
 * the action definitions have changed since.
 */
export const readFlowDefinitionSnapshot = async (
  migrationNumber: string,
): Promise<FlowDefinitionWithId[]> =>
  JSON.parse(
    await readFile(
      path.join(flowDefinitionSnapshotDirectory, `${migrationNumber}.json`),
      "utf8",
    ),
  ) as FlowDefinitionWithId[];

/**
 * The latest snapshot of each flow, by flow definition id, with the number of the migration that seeds it.
 */
export const getLatestFlowDefinitionSnapshots = async () => {
  const migrationNumbers = (await readdir(flowDefinitionSnapshotDirectory))
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => fileName.replace(/\.json$/, ""))
    .sort();

  const latestSnapshots = new Map<
    string,
    {
      migrationNumber: string;
      flowDefinition: FlowDefinitionWithId["flowDefinition"];
    }
  >();

  for (const migrationNumber of migrationNumbers) {
    for (const {
      flowDefinitionId,
      flowDefinition,
    } of await readFlowDefinitionSnapshot(migrationNumber)) {
      latestSnapshots.set(flowDefinitionId, {
        migrationNumber,
        flowDefinition,
      });
    }
  }

  return latestSnapshots;
};
