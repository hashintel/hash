import type { EntityType } from "@blockprotocol/type-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { BaseUrl } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { getEntityTypeById } from "../../../ontology/primitive/entity-type";
import type { MigrationFunction } from "../types";
import {
  createSystemPropertyTypeIfNotExists,
  getCurrentHashDataTypeId,
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  upgradeDependenciesInHashEntityType,
  upgradeEntitiesToNewTypeVersion,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /** Step 1: Create the upload completed at */

  const dateTimeDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "datetime",
    migrationState,
  });

  const uploadCompletedAtPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Upload Completed At",
        description: "The timestamp when the upload of something has completed",
        possibleValues: [{ dataTypeId: dateTimeDataTypeId }],
      },
      webShortname: "hash",
      migrationState,
    });

  /** Step 2: Add the property to the file entity type */

  const currentFileEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "file",
    migrationState,
  });

  const { schema: fileEntityTypeSchema } = await getEntityTypeById(
    context,
    authentication,
    {
      entityTypeId: currentFileEntityTypeId,
    },
  );

  const newFileEntityTypeSchema: EntityType = {
    ...fileEntityTypeSchema,
    properties: {
      ...fileEntityTypeSchema.properties,
      [extractBaseUrl(uploadCompletedAtPropertyType.schema.$id)]: {
        $ref: uploadCompletedAtPropertyType.schema.$id,
      },
    },
  };

  const { updatedEntityTypeId: updatedFileEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentFileEntityTypeId,
      migrationState,
      newSchema: newFileEntityTypeSchema,
    });

  /** Step 3: Update the dependencies of entity types which we've updated above */
  await upgradeDependenciesInHashEntityType(context, authentication, {
    upgradedEntityTypeIds: [updatedFileEntityTypeId],
    dependentEntityTypeKeys: [
      // `Image` inherits from the `File` entity type
      "image",
    ],
    migrationState,
  });

  /** Step 4: Assign entities of updated types to the latest version */
  const baseUrls = [
    systemEntityTypes.file.entityTypeBaseUrl,
    systemEntityTypes.image.entityTypeBaseUrl,
  ] as BaseUrl[];

  await upgradeEntitiesToNewTypeVersion(context, authentication, {
    entityTypeBaseUrls: baseUrls,
    migrationState,
  });

  return migrationState;
};

export default migrate;
