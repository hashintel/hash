import type { BaseUrl, EntityType } from "@blockprotocol/type-system";
import {
  blockProtocolEntityTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getEntityTypeById } from "../../../ontology/primitive/entity-type";
import type { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
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
  /**
   * Step 1. Create the Browser Plugin Settings entity type
   */
  const manualInferenceConfigurationPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Manual Inference Configuration",
        description: "Configuration for a manual entity inference feature",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    });

  const automaticInferenceConfigurationPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Automatic Inference Configuration",
        description:
          "Configuration for an automatic or passive entity inference feature",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "h",
      migrationState,
    });

  const popupTabPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Browser Plugin Tab",
        description: "A tab in the HASH browser plugin",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const draftNotePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Draft Note",
        description: "A working draft of a text note",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "h",
      migrationState,
    },
  );

  const browserPluginSettingsEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Browser Plugin Settings",
        titlePlural: "Browser Plugin Settings",
        icon: "/icons/types/gear.svg",
        description: "Settings for the HASH browser plugin",
        properties: [
          {
            propertyType: manualInferenceConfigurationPropertyType,
            required: true,
          },
          {
            propertyType: automaticInferenceConfigurationPropertyType,
            required: true,
          },
          {
            propertyType: popupTabPropertyType,
            required: true,
          },
          {
            propertyType: draftNotePropertyType,
          },
        ],
      },
      webShortname: "h",
      migrationState,
    });

  /**
   * Step 2: Create the 'has' link
   */
  const hasLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has",
        description: "Something that something has",
      },
      webShortname: "h",
      migrationState,
    },
  );

  /** Step 3: Update the User entity type to link to the Browser Plugin Settings entity type */
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
    links: {
      ...userEntityTypeSchema.links,
      [hasLinkEntityType.schema.$id]: {
        type: "array",
        items: {
          oneOf: [{ $ref: browserPluginSettingsEntityType.schema.$id }],
        },
      },
    },
  };

  const { updatedEntityTypeId: updatedUserEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentUserEntityTypeId,
      migrationState,
      newSchema: newUserEntityTypeSchema,
    });

  /** Step 4: Update the dependencies of entity types which we've updated above */
  await upgradeDependenciesInHashEntityType(context, authentication, {
    upgradedEntityTypeIds: [updatedUserEntityTypeId],
    dependentEntityTypeKeys: [
      // These can all link to a User
      "comment",
      "commentNotification",
      "linearIntegration",
      "mentionNotification",
    ],
    migrationState,
  });

  /** Step 5: Assign entities of updated types to the latest version */
  const baseUrls = [
    systemEntityTypes.user.entityTypeBaseUrl,
    systemEntityTypes.comment.entityTypeBaseUrl,
    systemEntityTypes.commentNotification.entityTypeBaseUrl,
    systemEntityTypes.linearIntegration.entityTypeBaseUrl,
    systemEntityTypes.mentionNotification.entityTypeBaseUrl,
  ] as BaseUrl[];

  await upgradeEntitiesToNewTypeVersion(context, authentication, {
    entityTypeBaseUrls: baseUrls,
    migrationState,
  });

  return migrationState;
};

export default migrate;
