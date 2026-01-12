import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractVersion } from "@blockprotocol/type-system";
import type { HashInstance } from "@local/hash-backend-utils/hash-instance";
import { getHashInstance } from "@local/hash-backend-utils/hash-instance";
import type { Logger } from "@local/hash-backend-utils/logger";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { MigrationsCompletedPropertyValueWithMetadata } from "@local/hash-isomorphic-utils/system-types/hashinstance";
import { NotFoundError } from "openai";

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
 * Save migration state to the HASH Instance entity.
 * Saves both the list of completed migrations and the accumulated type version state.
 */
const saveMigrationState = async (params: {
  context: ImpureGraphContext<false, true>;
  hashInstance: HashInstance;
  migrationsCompleted: string[];
  migrationState: MigrationState;
}) => {
  const { context, hashInstance, migrationsCompleted, migrationState } = params;
  const authentication = { actorId: systemAccountId };

  await hashInstance.entity.patch(context.graphApi, authentication, {
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
      {
        op: "add",
        path: [systemPropertyTypes.migrationState.propertyTypeBaseUrl],
        property: {
          value: migrationState,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
          },
        },
      },
    ],
    provenance: {
      actorType: "machine",
      origin: {
        type: "migration",
      },
    },
  });
};

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

  /**
   * Try to load previously saved migration state.
   * Instances either have both migrationsCompleted and migrationState saved, or neither.
   */
  try {
    const hashInstance = await getHashInstance(params.context, authentication);

    const storedMigrationsCompleted = hashInstance.migrationsCompleted;
    const storedMigrationState = hashInstance.migrationState as
      | MigrationState
      | undefined;

    if (storedMigrationsCompleted && storedMigrationState) {
      migrationsCompleted.push(...storedMigrationsCompleted);
      migrationState = storedMigrationState;
      params.logger.debug(
        `Loaded migration state: ${migrationsCompleted.length} migrations completed, ` +
          `${Object.keys(migrationState.entityTypeVersions).length} entity types, ` +
          `${Object.keys(migrationState.propertyTypeVersions).length} property types, ` +
          `${Object.keys(migrationState.dataTypeVersions).length} data types`,
      );
    }
  } catch (getHashInstanceError) {
    if (getHashInstanceError instanceof NotFoundError) {
      params.logger.debug(
        `HASH Instance entity not available, this is the first time the instance is being initialized`,
      );
    } else {
      throw getHashInstanceError;
    }
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

      /**
       * Save migration state after each migration completes.
       * This ensures we can resume from the correct state if the process is interrupted.
       */
      try {
        const hashInstance = await getHashInstance(
          params.context,
          authentication,
        );

        const hashInstanceVersion = extractVersion(
          hashInstance.entity.metadata.entityTypeIds[0],
        );

        if (parseInt(hashInstanceVersion, 10) < 2) {
          params.logger.debug(
            `Skipping migration state save in migration ${migrationNumber} as HASH Instance v${hashInstanceVersion} will not yet have migration state properties`,
          );
          continue;
        }

        await saveMigrationState({
          context: params.context,
          hashInstance,
          migrationsCompleted,
          migrationState,
        });
      } catch (saveMigrationStateError) {
        if (saveMigrationStateError instanceof NotFoundError) {
          params.logger.debug(
            `Skipping migration state save in migration ${migrationNumber} as HASH Instance does not yet exist`,
          );
        } else {
          throw saveMigrationStateError;
        }
      }
    }
  }

  const hashInstance = await getHashInstance(params.context, authentication);

  await saveMigrationState({
    context: params.context,
    hashInstance,
    migrationsCompleted,
    migrationState,
  });
};
