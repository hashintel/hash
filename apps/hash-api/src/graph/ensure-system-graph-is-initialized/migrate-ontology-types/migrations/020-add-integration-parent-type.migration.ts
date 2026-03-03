import type { EntityType } from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { enabledIntegrations } from "../../../../integrations/enabled-integrations";
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

    const linearIntegrationEntityType = await getEntityTypeById(
      context.graphApi,
      authentication,
      {
        entityTypeId: currentLinearIntegrationEntityTypeId,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    );

    if (!linearIntegrationEntityType) {
      throw new NotFoundError(
        `Could not find entity type with ID ${currentLinearIntegrationEntityTypeId}`,
      );
    }

    const newLinearIntegrationEntityTypeSchema: EntityType = {
      ...linearIntegrationEntityType.schema,
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
