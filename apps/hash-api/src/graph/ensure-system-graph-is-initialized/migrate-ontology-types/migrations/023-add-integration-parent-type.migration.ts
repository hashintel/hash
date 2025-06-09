import { type EntityType } from "@blockprotocol/type-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

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

  const currentLinearIntegrationEntityTypeId = getCurrentHashSystemEntityTypeId(
    {
      entityTypeKey: "linearIntegration",
      migrationState,
    },
  );

  const { schema: linearIntegrationEntityTypeSchema } = await getEntityTypeById(
    context,
    authentication,
    {
      entityTypeId: currentLinearIntegrationEntityTypeId,
    },
  );

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
    entityTypeBaseUrls: [systemEntityTypes.linearIntegration.entityTypeBaseUrl],
    migrationState,
  });

  return migrationState;
};

export default migrate;
