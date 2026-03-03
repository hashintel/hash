import type { EntityType } from "@blockprotocol/type-system";
import { atLeastOne } from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import {
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
        icon: "/icons/types/user.svg",
      },
      webShortname: "h",
      migrationState,
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
      webShortname: "h",
      migrationState,
    });

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Machine",
      titlePlural: "Machines",
      icon: "/icons/types/user-robot.svg",
      labelProperty: blockProtocolPropertyTypes.displayName.propertyTypeBaseUrl,
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
    webShortname: "h",
    migrationState,
  });

  /** Step 3: Update the User entity type to inherit from Actor */

  const currentUserEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "user",
    migrationState,
  });

  const userEntityType = await getEntityTypeById(
    context.graphApi,
    authentication,
    {
      entityTypeId: currentUserEntityTypeId,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

  if (!userEntityType) {
    throw new NotFoundError(
      `Could not find entity type with ID ${currentUserEntityTypeId}`,
    );
  }

  const newUserEntityTypeSchema = {
    ...userEntityType.schema,
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
      webShortname: "h",
      migrationState,
    },
  );

  const currentOccurredInEntityEntityTypeId = getCurrentHashLinkEntityTypeId({
    linkEntityTypeKey: "occurredInEntity",
    migrationState,
  });

  const occurredInEntityEntityType = await getEntityTypeById(
    context.graphApi,
    authentication,
    {
      entityTypeId: currentOccurredInEntityEntityTypeId,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

  if (!occurredInEntityEntityType) {
    throw new NotFoundError(
      `Could not find entity type with ID ${currentOccurredInEntityEntityTypeId}`,
    );
  }

  const newOccurredInEntityEntityTypeSchema = {
    ...occurredInEntityEntityType.schema,
    properties: {
      ...occurredInEntityEntityType.schema.properties,
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
      webShortname: "h",
      migrationState,
    },
  );

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Graph Change Notification",
      titlePlural: "Graph Change Notifications",
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
    webShortname: "h",
    migrationState,
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
