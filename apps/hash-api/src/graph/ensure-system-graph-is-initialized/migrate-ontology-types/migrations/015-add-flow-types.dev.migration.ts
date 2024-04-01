import type { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1: create the `Flow Definition` entity type.
   */

  /** @todo */

  /**
   * Step 2: create the `Flow` entity type.
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

  const inputsPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Inputs",
        description: "The inputs of something.",
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

  const _flowEntityType = await createSystemEntityTypeIfNotExists(
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
            propertyType: inputsPropertyType,
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

  return migrationState;
};

export default migrate;
