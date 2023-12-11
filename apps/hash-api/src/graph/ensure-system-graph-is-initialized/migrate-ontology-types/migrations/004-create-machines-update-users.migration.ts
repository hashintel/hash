import { EntityType } from "@blockprotocol/type-system";
import {
  createWebMachineActor,
  getWebMachineActorId,
} from "@local/hash-backend-utils/machine-actors";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { AccountId, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

import { NotFoundError } from "../../../../lib/error";
import { getEntityTypeById } from "../../../ontology/primitive/entity-type";
import { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getEntitiesByType,
  getExistingHashLinkEntityTypeId,
  getExistingHashPropertyTypeId,
  getExistingHashSystemEntityTypeId,
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
  const preferredNamePropertyTypeId = getExistingHashPropertyTypeId({
    propertyTypeKey: "preferredName",
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
      ],
      allOf: [actorEntityType.schema.$id],
    },
    webShortname: "hash",
    migrationState,
    instantiator: null,
  });

  /** Step 3: Update the User entity type to inherit from Actor */

  const currentUserEntityTypeId = getExistingHashSystemEntityTypeId({
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
      updateExistingEntitiesToNewVersion: true,
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

  const currentOccurredInEntityEntityTypeId = getExistingHashLinkEntityTypeId({
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
      updateExistingEntitiesToNewVersion: true,
    });

  /** Step 5: Create a new Graph Change notification type to notify of generic CRUD operations in the graph */

  const notificationEntityType = getExistingHashSystemEntityTypeId({
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
    instantiator: null,
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
    updateExistingEntitiesToNewVersion: true,
  });

  /**
   * Step 7: Create web machine actors for existing webs
   *
   * This step is only required to transition existing instances, and can be deleted once they have been migrated.
   */
  const users = await getEntitiesByType(context, authentication, {
    entityTypeId: currentUserEntityTypeId,
  });

  for (const user of users) {
    const userAccountId = extractOwnedByIdFromEntityId(
      user.metadata.recordId.entityId,
    );
    try {
      await getWebMachineActorId(context, authentication, {
        ownedById: userAccountId,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        await createWebMachineActor(
          context,
          // We have to use the user's authority to add the machine to their web
          { actorId: userAccountId as AccountId },
          {
            ownedById: userAccountId,
          },
        );
      } else {
        throw new Error(
          `Unexpected error attempting to retrieve machine web actor for user ${user.metadata.recordId.entityId}`,
        );
      }
    }
  }

  const orgEntityTypeId = getExistingHashSystemEntityTypeId({
    entityTypeKey: "organization",
    migrationState,
  });

  const orgs = await getEntitiesByType(context, authentication, {
    entityTypeId: orgEntityTypeId,
  });

  for (const org of orgs) {
    const orgAccountGroupId = extractOwnedByIdFromEntityId(
      org.metadata.recordId.entityId,
    );
    try {
      await getWebMachineActorId(context, authentication, {
        ownedById: orgAccountGroupId,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        const orgAdminAccountId = org.metadata.provenance.recordCreatedById;

        await createWebMachineActor(
          context,
          // We have to use an org admin's authority to add the machine to their web
          { actorId: orgAdminAccountId },
          {
            ownedById: orgAccountGroupId,
          },
        );
      } else {
        throw new Error(
          `Unexpected error attempting to retrieve machine web actor for organization ${org.metadata.recordId.entityId}`,
        );
      }
    }
  }
  /** End Step 7, which can be deleted once all existing instances have been migrated */

  return migrationState;
};

export default migrate;
