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
import type { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
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

  return migrationState;
};

export default migrate;
