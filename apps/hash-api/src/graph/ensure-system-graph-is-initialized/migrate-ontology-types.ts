import { readdir } from "node:fs/promises";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { Logger } from "@local/hash-backend-utils/logger";

import { isProdEnv } from "../../lib/env-config";
import type { ImpureGraphContext } from "../context-types";
import { systemAccountId } from "../system-account";
import type {
  MigrationFunction,
  MigrationState,
} from "./migrate-ontology-types/types";

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
      /**
       * If the migration file is marked with `.dev.migration.ts`, it
       * should only be seeded in non-production environments.
       */
      if (isProdEnv && migrationFileName.endsWith(".dev.migration.ts")) {
        params.logger.debug(`Skipping dev migration ${migrationFileName}`);
        continue;
      }

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

      params.logger.debug(`Processed migration ${migrationFileName}`);
    }
  }
};
