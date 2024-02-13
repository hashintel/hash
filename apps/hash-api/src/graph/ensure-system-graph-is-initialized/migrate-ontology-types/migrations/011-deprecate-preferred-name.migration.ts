import { EntityType } from "@blockprotocol/type-system";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { BaseUrl } from "@local/hash-subgraph/.";

import { getEntityTypeById } from "../../../ontology/primitive/entity-type";
import { MigrationFunction } from "../types";
import {
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  upgradeDependenciesInHashEntityType,
  upgradeEntitiesToNewTypeVersion,
} from "../util";
import { replaceEntityTypeReference } from "../util/upgrade-entity-type-dependencies";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1. Update the `Actor` entity type to define the `displayName` property type
   */

  const currentActorEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "actor",
    migrationState,
  });

  const { schema: actorEntityTypeSchema } = await getEntityTypeById(
    context,
    authentication,
    {
      entityTypeId: currentActorEntityTypeId,
    },
  );

  const {
    propertyTypeId: displayNamePropertyTypeId,
    propertyTypeBaseUrl: displayNameBaseUrl,
  } = blockProtocolPropertyTypes.displayName;

  const newActorEntityTypeSchema: EntityType = {
    ...actorEntityTypeSchema,
    properties: {
      ...actorEntityTypeSchema.properties,
      [displayNameBaseUrl]: {
        $ref: displayNamePropertyTypeId,
      },
    },
  };

  const { updatedEntityTypeId: updatedActorEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentActorEntityTypeId,
      migrationState,
      newSchema: newActorEntityTypeSchema,
    });

  /**
   * Step 2. Update `Machine` to inherit from the latest version of `Actor`
   */

  /** @todo: fix upgrading "Machine" entity type */
  await upgradeDependenciesInHashEntityType(context, authentication, {
    upgradedEntityTypeIds: [updatedActorEntityTypeId],
    dependentEntityTypeKeys: ["machine"],
    migrationState,
  });

  /**
   * Step 3. Update `User` to inherit from the latest version of `Actor`,
   * removing the `preferredName` property type in the same update
   */

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

  const newUserEntityTypeSchema: EntityType = {
    ...userEntityTypeSchema,
    properties: Object.entries(userEntityTypeSchema.properties).reduce(
      (prev, [propertyTypeBaseUrl, value]) => {
        if (
          propertyTypeBaseUrl ===
          systemPropertyTypes.preferredName.propertyTypeBaseUrl
        ) {
          return prev;
        } else {
          return {
            ...prev,
            [propertyTypeBaseUrl]: value,
          };
        }
      },
      {},
    ),
    allOf: userEntityTypeSchema.allOf?.map((reference) =>
      replaceEntityTypeReference({
        reference,
        upgradedEntityTypeIds: [updatedActorEntityTypeId],
      }),
    ),
  };

  await updateSystemEntityType(context, authentication, {
    currentEntityTypeId: currentUserEntityTypeId,
    migrationState,
    newSchema: newUserEntityTypeSchema,
  });

  /**
   * Step 4: Assign entities of updated types to the latest version
   */
  const baseUrls = [
    systemEntityTypes.machine.entityTypeBaseUrl,
    systemEntityTypes.user.entityTypeBaseUrl,
  ] as BaseUrl[];

  await upgradeEntitiesToNewTypeVersion(context, authentication, {
    entityTypeBaseUrls: baseUrls,
    migrationState,
    migrateProperties: {
      [systemEntityTypes.user.entityTypeBaseUrl as BaseUrl]: (
        previousUserProperties,
      ) => {
        const {
          [systemPropertyTypes.preferredName.propertyTypeBaseUrl as BaseUrl]:
            previousPreferredName,
          ...remainingProperties
        } = previousUserProperties;

        return {
          ...remainingProperties,
          [displayNameBaseUrl]: previousPreferredName,
        };
      },
    },
  });

  return migrationState;
};

export default migrate;
