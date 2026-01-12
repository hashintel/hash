import type { EntityType } from "@blockprotocol/type-system";
import { getWebMachineId } from "@local/hash-backend-utils/machine-actors";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { createPolicy, deletePolicyById } from "@local/hash-graph-sdk/policy";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getOrCreateOwningWebId } from "../../system-webs-and-entities";
import type { MigrationFunction } from "../types";
import {
  createSystemPropertyTypeIfNotExists,
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  upgradeEntitiesToNewTypeVersion,
} from "../util";

/**
 * This migration adds tracking properties to the HASH Instance entity type:
 * - `migrationsCompleted`: Array of migration numbers that have been run
 * - `migrationState`: JSON object containing type version state from migrations
 *
 * Together these allow subsequent startups to skip already-completed migrations
 * while still having access to the correct type version information.
 */
const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1: Create the property types for tracking migration state.
   */
  const migrationsCompletedPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Migrations Completed",
        description:
          "The migrations that have been completed for this instance",
        possibleValues: [{ primitiveDataType: "text", array: true }],
      },
      webShortname: "h",
      migrationState,
    });

  const migrationStatePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Migration State",
        description:
          "The accumulated state of type versions from running migrations, stored as a JSON object.",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  /**
   * Step 2: Update HASH Instance entity type to include both properties.
   */
  const currentHashInstanceEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "hashInstance",
    migrationState,
  });

  const hashInstanceEntityType = await getEntityTypeById(
    context.graphApi,
    authentication,
    {
      entityTypeId: currentHashInstanceEntityTypeId,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

  if (!hashInstanceEntityType) {
    throw new Error(
      `Could not find entity type with ID ${currentHashInstanceEntityTypeId}`,
    );
  }

  const newHashInstanceEntityTypeSchema: EntityType = {
    ...hashInstanceEntityType.schema,
    properties: {
      ...hashInstanceEntityType.schema.properties,
      [migrationsCompletedPropertyType.metadata.recordId.baseUrl]: {
        $ref: migrationsCompletedPropertyType.schema.$id,
      },
      [migrationStatePropertyType.metadata.recordId.baseUrl]: {
        $ref: migrationStatePropertyType.schema.$id,
      },
    },
  };

  const { updatedEntityTypeId } = await updateSystemEntityType(
    context,
    authentication,
    {
      currentEntityTypeId: currentHashInstanceEntityTypeId,
      migrationState,
      newSchema: newHashInstanceEntityTypeSchema,
    },
  );

  /**
   * Step 3: Create temporary policies and upgrade HASH Instance entities.
   */
  const { webId: hashWebId } = await getOrCreateOwningWebId(context, "h");

  const hashWebBotAccountId = await getWebMachineId(context, authentication, {
    webId: hashWebId,
  }).then((maybeMachineId) => {
    if (!maybeMachineId) {
      throw new Error(
        `Failed to get web bot account ID for web ID: ${hashWebId}`,
      );
    }
    return maybeMachineId;
  });

  const instantiationPolicies = await Promise.all(
    [updatedEntityTypeId, currentHashInstanceEntityTypeId].map(
      async (entityTypeId) =>
        createPolicy(context.graphApi, authentication, {
          name: "tmp-hash-instance-instantiate",
          effect: "permit",
          principal: {
            type: "actor",
            actorType: "machine",
            id: hashWebBotAccountId,
          },
          actions: ["instantiate"],
          resource: {
            type: "entityType",
            id: entityTypeId,
          },
        }),
    ),
  );

  try {
    await upgradeEntitiesToNewTypeVersion(context, authentication, {
      entityTypeBaseUrls: [systemEntityTypes.hashInstance.entityTypeBaseUrl],
      migrationState,
    });
  } finally {
    await Promise.all(
      instantiationPolicies.map(async (policyId) =>
        deletePolicyById(context.graphApi, authentication, policyId, {
          permanent: true,
        }),
      ),
    );
  }

  return migrationState;
};

export default migrate;
