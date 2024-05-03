import type { EntityType } from "@blockprotocol/type-system";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { BaseUrl } from "@local/hash-subgraph";
import { linkEntityTypeUrl } from "@local/hash-subgraph";

import { getEntityTypeById } from "../../../ontology/primitive/entity-type";
import type { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
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
   * Step 1: create the `Flow Definition` entity type.
   */

  const triggerDefinitionIdPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Trigger Definition ID",
        description: "The ID of the trigger definition.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "hash",
      migrationState,
    });

  const outputDefinitionsPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Output Definitions",
        description: "The output definitions of something.",
        possibleValues: [
          {
            primitiveDataType: "object",
            array: true,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
    });

  const triggerDefinitionPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Trigger Definition",
        description: "The trigger definition of a flow.",
        possibleValues: [
          {
            propertyTypeObjectProperties: {
              [triggerDefinitionIdPropertyType.metadata.recordId.baseUrl]: {
                $ref: triggerDefinitionIdPropertyType.schema.$id,
              },
              [outputDefinitionsPropertyType.metadata.recordId.baseUrl]: {
                $ref: outputDefinitionsPropertyType.schema.$id,
              },
            },
            propertyTypeObjectRequiredProperties: [
              triggerDefinitionIdPropertyType.metadata.recordId.baseUrl,
            ],
          },
        ],
      },
      webShortname: "hash",
      migrationState,
    });

  const stepDefinitionsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Step Definitions",
        description: "The step definitions of a flow.",
        possibleValues: [
          {
            primitiveDataType: "object",
            array: true,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const _flowDefinitionEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Flow Definition",
        description: "The definition of  a HASH flow.",
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
            required: true,
          },
          {
            propertyType: triggerDefinitionPropertyType,
            required: true,
          },
          {
            propertyType: stepDefinitionsPropertyType,
            required: true,
          },
          {
            propertyType: outputDefinitionsPropertyType,
            required: true,
          },
        ],
      },

      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /**
   * Step 2: create the `Flow` entity type.
   */

  const outputsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Outputs",
        description: "The outputs of something.",
        possibleValues: [
          /** @todo: consider constraining this type further */
          {
            primitiveDataType: "object",
            array: true,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const triggerPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Trigger",
        description: "The trigger of a flow.",
        possibleValues: [
          {
            propertyTypeObjectProperties: {
              [triggerDefinitionIdPropertyType.metadata.recordId.baseUrl]: {
                $ref: triggerDefinitionIdPropertyType.schema.$id,
              },
              [outputsPropertyType.metadata.recordId.baseUrl]: {
                $ref: outputsPropertyType.schema.$id,
              },
            },
            propertyTypeObjectRequiredProperties: [
              triggerDefinitionIdPropertyType.metadata.recordId.baseUrl,
            ],
          },
        ],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const flowDefinitionIdPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Flow Definition ID",
        description:
          "The ID of the flow definition (the `entityId` of the flow definition entity).",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "hash",
      migrationState,
    });

  const stepsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Step",
        description: "A step in a flow run.",
        possibleValues: [
          /** @todo: consider constraining this type further. */
          {
            primitiveDataType: "object",
            array: true,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const flowEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Flow",
        description: "A HASH flow run.",
        properties: [
          {
            propertyType: triggerPropertyType,
            required: true,
          },
          {
            propertyType: flowDefinitionIdPropertyType,
            required: true,
          },
          {
            propertyType: stepsPropertyType,
            required: true,
          },
          {
            propertyType: outputsPropertyType,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /**
   * Step 3: create a `Incurred In` link entity type, and update
   * the `Usage Record` entity type to have it as an outgoing link to a `Flow`.
   */

  const incurredInLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Incurred In",
        description: "Something that was incurred in something else.",
        properties: [],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const currentUsageRecordEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "usageRecord",
    migrationState,
  });

  const { schema: usageRecordEntityTypeSchema } = await getEntityTypeById(
    context,
    authentication,
    {
      entityTypeId: currentUsageRecordEntityTypeId,
    },
  );

  const newUsageRecordEntityTypeSchema: EntityType = {
    ...usageRecordEntityTypeSchema,
    links: {
      ...usageRecordEntityTypeSchema.links,
      [incurredInLinkEntityType.schema.$id]: {
        ordered: false,
        type: "array",
        items: {
          oneOf: [{ $ref: flowEntityType.schema.$id }],
        },
      },
    },
  };

  const { updatedEntityTypeId: _updatedUsageRecordEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentUsageRecordEntityTypeId,
      migrationState,
      newSchema: newUsageRecordEntityTypeSchema,
    });

  /**
   * Step 4: Upgrade existing usage record entities to the latest version
   */

  await upgradeEntitiesToNewTypeVersion(context, authentication, {
    entityTypeBaseUrls: [
      systemEntityTypes.usageRecord.entityTypeBaseUrl as BaseUrl,
    ],
    migrationState,
  });

  return migrationState;
};

export default migrate;
