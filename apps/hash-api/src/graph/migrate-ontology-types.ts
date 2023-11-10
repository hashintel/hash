import { readdir } from "node:fs/promises";
import path from "node:path";

import { Logger } from "@local/hash-backend-utils/logger";

import { ImpureGraphContext } from "./context-types";
import {
  MigrationFunction,
  MigrationState,
} from "./migrate-ontology-types/types";
import { systemAccountId } from "./system-account";

export const migrateOntologyTypes = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const authentication = { actorId: systemAccountId };

  const migrationDirectory = path.join(
    __dirname,
    "migrate-ontology-types/migrations",
  );

  const migrationFileNames = await readdir(migrationDirectory);

  const sortedMigrationFileNames = migrationFileNames.sort();

  let migrationState: MigrationState = {
    propertyTypeVersions: {},
    entityTypeVersions: {},
    dataTypeVersions: {},
  };

  for (const migrationFileName of sortedMigrationFileNames) {
    if (migrationFileName.endsWith(".migration.ts")) {
      const filePath = path.join(migrationDirectory, migrationFileName);

      const module = await import(filePath);

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
