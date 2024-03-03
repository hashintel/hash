import { readdir } from "node:fs/promises";
import path from "node:path";

import { Logger } from "@local/hash-backend-utils/logger";

import { ImpureGraphContext } from "../context-types";
import { systemAccountId } from "../system-account";
import {
  MigrationFunction,
  MigrationState,
} from "./migrate-ontology-types/types";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Migrate the ontology types in the Graph API.
 */
export const migrateOntologyTypes = async (params: {
  logger: Logger;
  context: ImpureGraphContext<false, true>;
}) => {
  const authentication = { actorId: systemAccountId };

  const migrationDirectory = path.join(
    __dirname,
    "migrate-ontology-types/migrations",
  );

  const migrationFileNames = (await readdir(migrationDirectory))
    .filter((fileName) => fileName.endsWith(".migration.ts"))
    .sort();

  let migrationState: MigrationState = {
    propertyTypeVersions: {},
    entityTypeVersions: {},
    dataTypeVersions: {},
  };

  for (const migrationFileName of migrationFileNames) {
    if (migrationFileName.endsWith(".migration.ts")) {
      const filePath = path.join(migrationDirectory, migrationFileName);

      const module = await import(filePath);

      // Expect the default export of a migration file to be of type `MigrationFunction`
      const migrationFunction = module.default as MigrationFunction;

      /** @todo: consider persisting which migration files have been run */

      migrationState = await migrationFunction({
        ...params,
        authentication,
        migrationState,
      });
    }
  }
};
