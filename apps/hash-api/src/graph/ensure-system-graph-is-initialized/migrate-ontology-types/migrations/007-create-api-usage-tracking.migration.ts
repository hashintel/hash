import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { ServiceFeatureProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { Entity, OwnedById } from "@local/hash-subgraph";
import { linkEntityTypeUrl } from "@local/hash-subgraph";

import { logger } from "../../../../logger";
import { createEntity } from "../../../knowledge/primitive/entity";
import { getOrgByShortname } from "../../../knowledge/system-types/org";
import type { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashDataTypeId,
  getEntitiesByType,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /** Step 1: Create an entity type that describes a chargeable service */
  const serviceNamePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Service Name",
        description: "The name of a service",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const featureNamePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Feature Name",
        description: "The name of a feature",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const inputUnitCostPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Input Unit Cost",
        description: "The cost of an input unit",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const outputUnitCostPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Output Unit Cost",
        description: "The cost of an output unit",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const datetimeDataTypeVersionedUrl = getCurrentHashDataTypeId({
    dataTypeKey: "datetime",
    migrationState,
  });

  const appliesFromPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Applies From",
        description: "The point in time at which something begins to apply",
        possibleValues: [{ dataTypeId: datetimeDataTypeVersionedUrl }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const appliesUntilPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Applies Until",
        description: "The point at which something ceases to apply",
        possibleValues: [{ dataTypeId: datetimeDataTypeVersionedUrl }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const serviceUnitCost = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Service Unit Cost",
        description: "The unit cost of a service",
        possibleValues: [
          {
            propertyTypeObjectProperties: {
              [inputUnitCostPropertyType.metadata.recordId.baseUrl]: {
                $ref: inputUnitCostPropertyType.schema.$id,
              },
              [outputUnitCostPropertyType.metadata.recordId.baseUrl]: {
                $ref: outputUnitCostPropertyType.schema.$id,
              },
              [appliesFromPropertyType.metadata.recordId.baseUrl]: {
                $ref: appliesFromPropertyType.schema.$id,
              },
              [appliesUntilPropertyType.metadata.recordId.baseUrl]: {
                $ref: appliesUntilPropertyType.schema.$id,
              },
            },
            propertyTypeObjectRequiredProperties: [
              appliesFromPropertyType.metadata.recordId.baseUrl,
            ],
          },
        ],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const serviceFeatureEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Service Feature",
        description: "A feature of a service",
        properties: [
          {
            propertyType: serviceNamePropertyType,
            required: true,
          },
          {
            propertyType: featureNamePropertyType,
            required: true,
          },
          {
            propertyType: serviceUnitCost,
            array: true,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /** Step 2: Create an entity type which records usage of a chargeable service */

  const recordsUsageOfLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Records Usage Of",
        description: "The thing that something records usage of.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const createdLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Created",
        description: "The thing that something created.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const updatedLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Updated",
        description: "The thing that something created.",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  const inputUnitCountPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Input Unit Count",
        description: "How many input units were or will be used",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  const outputUnitCountPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Output Unit Count",
        description: "How many output units were or will be used",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webShortname: "hash",
      migrationState,
    },
  );

  await createSystemEntityTypeIfNotExists(context, authentication, {
    entityTypeDefinition: {
      title: "Usage Record",
      description: "A record of usage of a service",
      properties: [
        {
          propertyType: inputUnitCountPropertyType,
        },
        {
          propertyType: outputUnitCountPropertyType,
        },
      ],
      outgoingLinks: [
        {
          linkEntityType: recordsUsageOfLinkEntityType,
          destinationEntityTypes: [serviceFeatureEntityType],
          minItems: 1,
          maxItems: 1,
        },
        {
          linkEntityType: createdLinkEntityType,
        },
        {
          linkEntityType: updatedLinkEntityType,
        },
      ],
    },
    webShortname: "hash",
    migrationState,
    instantiator: anyUserInstantiator,
  });

  /**
   * Step 3: Create the initial Service Feature entities
   */
  const initialServices = [
    /** @see https://openai.com/pricing */
    {
      serviceName: "OpenAI",
      featureName: "gpt-4-1106-preview",
      inputUnitCost: 0.00001, // price per input token
      outputUnitCost: 0.00003, // price per output token
    },
    {
      serviceName: "OpenAI",
      featureName: "gpt-4",
      inputUnitCost: 0.00003,
      outputUnitCost: 0.00006,
    },
    {
      serviceName: "OpenAI",
      featureName: "gpt-3.5-turbo-1106",
      inputUnitCost: 0.000001,
      outputUnitCost: 0.000002,
    },
    {
      serviceName: "OpenAI",
      featureName: "gpt-4-0125-preview",
      inputUnitCost: 0.00001,
      outputUnitCost: 0.00003,
    },
    {
      serviceName: "OpenAI",
      featureName: "gpt-4-turbo",
      inputUnitCost: 0.00001,
      outputUnitCost: 0.00003,
    },
    /** @see https://www.anthropic.com/api */
    {
      serviceName: "Anthropic",
      featureName: "claude-3-opus-20240229",
      inputUnitCost: 0.000015,
      outputUnitCost: 0.000075,
    },
    {
      serviceName: "Anthropic",
      featureName: "claude-3-sonnet-20240229",
      inputUnitCost: 0.000003,
      outputUnitCost: 0.000015,
    },
    {
      serviceName: "Anthropic",
      featureName: "claude-3-haiku-20240307",
      inputUnitCost: 0.00000025,
      outputUnitCost: 0.00000125,
    },
    {
      serviceName: "Anthropic",
      featureName: "claude-2.1",
      inputUnitCost: 0.000008,
      outputUnitCost: 0.000024,
    },
    {
      serviceName: "Anthropic",
      featureName: "claude-2.0",
      inputUnitCost: 0.000008,
      outputUnitCost: 0.000024,
    },
    {
      serviceName: "Anthropic",
      featureName: "claude-instant-1.2",
      inputUnitCost: 0.0000008,
      outputUnitCost: 0.0000024,
    },
  ];

  const hashOrg = await getOrgByShortname(context, authentication, {
    shortname: "hash",
  });
  if (!hashOrg) {
    throw new Error(
      "Org with shortname 'hash' does not exist by migration 007, but it should.",
    );
  }
  const hashOwnedById = hashOrg.accountGroupId;

  const existingServiceFeatureEntities = (await getEntitiesByType(
    context,
    authentication,
    {
      entityTypeId: serviceFeatureEntityType.schema.$id,
    },
  )) as Entity<ServiceFeatureProperties>[];

  for (const {
    serviceName,
    featureName,
    inputUnitCost,
    outputUnitCost,
  } of initialServices) {
    const existingServiceFeatureEntity = existingServiceFeatureEntities.find(
      (entity) => {
        const {
          serviceName: serviceNameProperty,
          featureName: featureNameProperty,
        } = simplifyProperties(entity.properties);

        return (
          serviceNameProperty === serviceName &&
          featureNameProperty === featureName
        );
      },
    );

    if (existingServiceFeatureEntity) {
      logger.debug(
        `Skipping creation of service feature entity for ${serviceName}:${featureName} as it already exists`,
      );
      continue;
    }

    logger.info(
      `Creating service feature entity for ${serviceName}:${featureName}`,
    );

    await createEntity(context, authentication, {
      entityTypeId: serviceFeatureEntityType.schema.$id,
      properties: {
        [serviceNamePropertyType.metadata.recordId.baseUrl]: serviceName,
        [featureNamePropertyType.metadata.recordId.baseUrl]: featureName,
        [serviceUnitCost.metadata.recordId.baseUrl]: [
          {
            [inputUnitCostPropertyType.metadata.recordId.baseUrl]:
              inputUnitCost,
            [outputUnitCostPropertyType.metadata.recordId.baseUrl]:
              outputUnitCost,
            [appliesFromPropertyType.metadata.recordId.baseUrl]: new Date(
              "2023-12-20",
            ).toISOString(),
          },
        ],
      },
      ownedById: hashOwnedById as OwnedById,
      relationships: [
        {
          // Let the system account administer the service entities
          relation: "administrator",
          subject: {
            kind: "account",
            subjectId: authentication.actorId,
          },
        },
        {
          // Let HASH org admins administer the service feature entities
          relation: "setting",
          subject: {
            kind: "setting",
            subjectId: "administratorFromWeb",
          },
        },
        {
          // Let everyone view the service feature entities
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
    });
  }

  return migrationState;
};

export default migrate;
