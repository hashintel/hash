import type { EntityType } from "@blockprotocol/type-system";
import { atLeastOne } from "@blockprotocol/type-system";
import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getEntityTypeById } from "../../../ontology/primitive/entity-type";
import { systemAccountId } from "../../../system-account";
import type { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashLinkEntityTypeId,
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  upgradeDependenciesInHashEntityType,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1. Create the Actor entity type, which User and Machine will inherit from
   */
  const actorEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Actor",
        description:
          "Someone or something that can perform actions in the system",
      },
      webShortname: "hash",
      migrationState,
      instantiator: null,
    },
  );

  /**
   * Step 2: Create the Machine entity type
   */
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

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Machine",
      description: "A machine that can perform actions in the system",
      properties: [
        {
          propertyType: machineIdentifierPropertyType,
          required: true,
        },
        {
          propertyType: blockProtocolPropertyTypes.displayName.propertyTypeId,
          required: true,
        },
      ],
      allOf: [actorEntityType.schema.$id],
    },
    webShortname: "hash",
    migrationState,
    instantiator: {
      kind: "account",
      subjectId: systemAccountId,
    },
  });

  /** Step 3: Update the User entity type to inherit from Actor */

  const currentUserEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "user",
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
    allOf: atLeastOne([{ $ref: actorEntityType.schema.$id }]),
  };

  const { updatedEntityTypeId: updatedUserEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentUserEntityTypeId,
      migrationState,
      newSchema: newUserEntityTypeSchema,
    });

  /** Step 4: Update the Occurred in Entity link type to have an Entity Edition Id property, to track which edition was created */
  const editionIdPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Entity Edition Id",
        description: "An identifier for an edition of an entity",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const currentOccurredInEntityEntityTypeId = getCurrentHashLinkEntityTypeId({
    linkEntityTypeKey: "occurredInEntity",
    migrationState,
  });

  const { schema: occurredInEntityEntityTypeSchema } = await getEntityTypeById(
    context,
    authentication,
    {
      entityTypeId: currentOccurredInEntityEntityTypeId,
    },
  );

  const newOccurredInEntityEntityTypeSchema = {
    ...occurredInEntityEntityTypeSchema,
    properties: {
      ...occurredInEntityEntityTypeSchema.properties,
      [editionIdPropertyType.metadata.recordId.baseUrl]: {
        $ref: editionIdPropertyType.schema.$id,
      } satisfies EntityType["properties"][keyof EntityType["properties"]],
    },
  };

  const { updatedEntityTypeId: updatedOccurredInEntityEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentOccurredInEntityEntityTypeId,
      migrationState,
      newSchema: newOccurredInEntityEntityTypeSchema,
    });

  /** Step 5: Create a new Graph Change notification type to notify of generic CRUD operations in the graph */

  const notificationEntityType = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "notification",
    migrationState,
  });

  const graphChangeTypePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Graph Change Type",
        description:
          "The type of change that occurred (e.g. create, update, archive)",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Graph Change Notification",
      description: "A notification of a change to a graph",
      allOf: [notificationEntityType],
      properties: [
        {
          propertyType: graphChangeTypePropertyType,
          required: true,
        },
      ],
      outgoingLinks: [
        {
          linkEntityType: updatedOccurredInEntityEntityTypeId,
          minItems: 1,
          maxItems: 1,
        },
      ],
    },
    webShortname: "hash",
    migrationState,
    instantiator: anyUserInstantiator,
  });

  /** Step 6: Update the dependencies of entity types which we've updated above */
  await upgradeDependenciesInHashEntityType(context, authentication, {
    upgradedEntityTypeIds: [
      updatedUserEntityTypeId,
      updatedOccurredInEntityEntityTypeId,
    ],
    dependentEntityTypeKeys: [
      "comment",
      "commentNotification",
      "linearIntegration",
      "mentionNotification",
    ],
    migrationState,
  });

  return migrationState;
};

export default migrate;
