import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getEntityTypeById } from "../../ontology/primitive/entity-type";
import { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getExistingEntityTypeId,
  getExistingPropertyTypeId,
  updateSystemEntityType,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const preferredNamePropertyTypeId = getExistingPropertyTypeId({
    propertyTypeKey: "preferredName",
    migrationState,
  });

  const currentUserEntityTypeId = getExistingEntityTypeId({
    entityTypeKey: "user",
    migrationState,
  });

  const machineIdentifierPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Machine Identifier",
        description: "A unique identifier for a machine",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "hash",
      migrationState,
    });

  const actorEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Actor",
        description:
          "Someone or something that can perform actions in the system",
        properties: [
          {
            propertyType: preferredNamePropertyTypeId,
            required: true,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Machine",
      description: "A machine that can perform actions in the system",
      properties: [
        {
          propertyType: machineIdentifierPropertyType,
          required: true,
        },
      ],
      allOf: [actorEntityType.schema.$id],
    },
    webShortname: "hash",
    migrationState,
  });

  const { schema: userEntityTypeSchema } = await getEntityTypeById(
    context,
    authentication,
    {
      entityTypeId: currentUserEntityTypeId,
    },
  );

  const newUserEntityTypeSchema = {
    ...userEntityTypeSchema,
    allOf: [{ $ref: actorEntityType.schema.$id }],
    properties: Object.fromEntries(
      Object.entries(userEntityTypeSchema.properties).filter(
        ([baseUrl]) =>
          baseUrl !== systemPropertyTypes.preferredName.propertyTypeBaseUrl,
      ),
    ),
  };

  const { updatedEntityTypeId: updatedUserEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentUserEntityTypeId,
      migrationState,
      newSchema: newUserEntityTypeSchema,
    });

  return migrationState;
};

export default migrate;
