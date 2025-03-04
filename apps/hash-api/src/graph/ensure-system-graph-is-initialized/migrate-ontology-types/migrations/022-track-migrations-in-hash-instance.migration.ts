import type { EntityType } from "@blockprotocol/type-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getEntityTypeById } from "../../../ontology/primitive/entity-type";
import type { MigrationFunction } from "../types";
import {
  createSystemPropertyTypeIfNotExists,
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  upgradeEntitiesToNewTypeVersion,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
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

  const currentHashInstanceEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "hashInstance",
    migrationState,
  });

  const { schema: hashInstanceEntityTypeSchema } = await getEntityTypeById(
    context,
    authentication,
    {
      entityTypeId: currentHashInstanceEntityTypeId,
    },
  );

  const newHashInstanceEntityTypeSchema: EntityType = {
    ...hashInstanceEntityTypeSchema,
    properties: {
      ...hashInstanceEntityTypeSchema.properties,
      [migrationsCompletedPropertyType.metadata.recordId.baseUrl]: {
        $ref: migrationsCompletedPropertyType.schema.$id,
      },
    },
  };

  await updateSystemEntityType(context, authentication, {
    currentEntityTypeId: currentHashInstanceEntityTypeId,
    migrationState,
    newSchema: newHashInstanceEntityTypeSchema,
  });

  //   await upgradeEntitiesToNewTypeVersion(context, authentication, {
  //     entityTypeBaseUrls: [systemEntityTypes.hashInstance.entityTypeBaseUrl],
  //     migrationState,
  //   });

  return migrationState;
};

export default migrate;
