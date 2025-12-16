import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import { getHashInstance } from "@local/hash-backend-utils/hash-instance";
import type { Logger } from "@local/hash-backend-utils/logger";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { MigrationsCompletedPropertyValueWithMetadata } from "@local/hash-isomorphic-utils/system-types/hashinstance";

import { isProdEnv } from "../../lib/env-config";
import type { ImpureGraphContext } from "../context-types";
import { systemAccountId } from "../system-account";
import type {
  MigrationFunction,
  MigrationState,
} from "./migrate-ontology-types/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  const migrationsCompleted: string[] = [];

  try {
    const hashInstance = await getHashInstance(params.context, authentication);
    migrationsCompleted.push(...(hashInstance.migrationsCompleted ?? []));
  } catch {
    // HASH Instance entity not available, this may be the first time the instance is being initialized
  }

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

      const migrationNumber = migrationFileName.split("-")[0];

      if (!migrationNumber) {
        throw new Error(
          `Migration file ${migrationFileName} has an invalid name. Migration files must be formatted as '{number}-{name}.migration.ts'`,
        );
      }

      if (migrationsCompleted.includes(migrationNumber)) {
        params.logger.info(
          `Skipping migration ${migrationFileName} as it has already been processed`,
        );
        continue;
      }

      migrationState = await migrationFunction({
        ...params,
        authentication,
        migrationState,
      });

      migrationsCompleted.push(migrationNumber);

      params.logger.info(`Processed migration ${migrationFileName}`);
    }
  }

  const hashInstance = await getHashInstance(params.context, authentication);

  await hashInstance.entity.patch(params.context.graphApi, authentication, {
    propertyPatches: [
      {
        op: "add",
        path: [systemPropertyTypes.migrationsCompleted.propertyTypeBaseUrl],
        property: {
          value: migrationsCompleted.map((migration) => ({
            value: migration,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          })),
        } satisfies MigrationsCompletedPropertyValueWithMetadata,
      },
    ],
    provenance: {
      actorType: "machine",
      origin: {
        type: "migration",
      },
    } satisfies ProvidedEntityEditionProvenance,
  });
};
