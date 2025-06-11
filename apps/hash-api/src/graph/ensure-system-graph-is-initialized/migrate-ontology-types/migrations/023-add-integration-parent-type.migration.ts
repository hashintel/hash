import {
  type EntityType,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import {
  googleEntityTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { enabledIntegrations } from "../../../../integrations/enabled-integrations";
import { getEntityTypeById } from "../../../ontology/primitive/entity-type";
import { getOrCreateOwningWebId } from "../../system-webs-and-entities";
import type { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
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
   * Create the integration entity type to act as a parent type for all integration types.
   */
  const integrationEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Integration",
        description: "An integration with a third-party service.",
        properties: [],
      },
      migrationState,
      webShortname: "h",
    },
  );

  if (enabledIntegrations.linear) {
    /**
     * Add the integration entity type as a parent of the linear integration entity type.
     */
    const currentLinearIntegrationEntityTypeId =
      getCurrentHashSystemEntityTypeId({
        entityTypeKey: "linearIntegration",
        migrationState,
      });

    const { schema: linearIntegrationEntityTypeSchema } =
      await getEntityTypeById(context, authentication, {
        entityTypeId: currentLinearIntegrationEntityTypeId,
      });

    const newLinearIntegrationEntityTypeSchema: EntityType = {
      ...linearIntegrationEntityTypeSchema,
      allOf: [
        {
          $ref: integrationEntityType.schema.$id,
        },
      ],
    };

    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentLinearIntegrationEntityTypeId,
      migrationState,
      newSchema: newLinearIntegrationEntityTypeSchema,
    });

    await upgradeEntitiesToNewTypeVersion(context, authentication, {
      entityTypeBaseUrls: [
        systemEntityTypes.linearIntegration.entityTypeBaseUrl,
      ],
      migrationState,
    });
  }

  if (enabledIntegrations.googleSheets) {
    /**
     * Add the integration entity type as a parent of the google integration entity type.
     */
    const googleIntegrationEntityTypeBaseUrl =
      googleEntityTypes.account.entityTypeBaseUrl;

    const entityTypeVersion =
      migrationState.entityTypeVersions[googleIntegrationEntityTypeBaseUrl];

    if (typeof entityTypeVersion === "undefined") {
      throw new Error(
        `Expected '${googleIntegrationEntityTypeBaseUrl}' entity type to have been seeded`,
      );
    }

    const currentGoogleIntegrationEntityTypeId = versionedUrlFromComponents(
      googleIntegrationEntityTypeBaseUrl,
      entityTypeVersion,
    );

    const { schema: googleIntegrationEntityTypeSchema } =
      await getEntityTypeById(context, authentication, {
        entityTypeId: currentGoogleIntegrationEntityTypeId,
      });

    const newGoogleIntegrationEntityTypeSchema: EntityType = {
      ...googleIntegrationEntityTypeSchema,
      allOf: [
        {
          $ref: integrationEntityType.schema.$id,
        },
      ],
    };

    const { systemActorMachineId: googleMachineId } =
      await getOrCreateOwningWebId(context, "google");

    const { updatedEntityTypeId: updatedAccountEntityTypeId } =
      await updateSystemEntityType(
        context,
        { actorId: googleMachineId },
        {
          currentEntityTypeId: currentGoogleIntegrationEntityTypeId,
          migrationState,
          newSchema: newGoogleIntegrationEntityTypeSchema,
        },
      );

    await upgradeDependenciesInHashEntityType(context, authentication, {
      upgradedEntityTypeIds: [updatedAccountEntityTypeId],
      dependentEntityTypeKeys: [
        "comment",
        "commentNotification",
        "linearIntegration",
        "mentionNotification",
      ],
      migrationState,
    });

    await upgradeEntitiesToNewTypeVersion(
      context,
      { actorId: googleMachineId },
      {
        entityTypeBaseUrls: [googleIntegrationEntityTypeBaseUrl],
        migrationState,
      },
    );
  }

  return migrationState;
};

export default migrate;
