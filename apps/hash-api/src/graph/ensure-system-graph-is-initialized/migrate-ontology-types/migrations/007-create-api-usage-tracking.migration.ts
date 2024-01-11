import { linkEntityTypeUrl, OwnedById } from "@local/hash-subgraph";
import { versionedUrlFromComponents } from "@local/hash-subgraph/type-system-patch";

import { logger } from "../../../../logger";
import { createEntity } from "../../../knowledge/primitive/entity";
import { getOrgByShortname } from "../../../knowledge/system-types/org";
import { getEntityTypeAuthorizationRelationships } from "../../../ontology/primitive/entity-type";
import { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  generateSystemTypeBaseUrl,
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

  const dateDataTypeBaseUrl = generateSystemTypeBaseUrl({
    kind: "data-type",
    title: "DateTime",
    shortname: "hash",
  });
  const dataTypeVersion = migrationState.dataTypeVersions[dateDataTypeBaseUrl]!;
  const dataTypeVersionUrl = versionedUrlFromComponents(
    dateDataTypeBaseUrl,
    dataTypeVersion,
  );

  const appliesFromPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Applies From",
        description: "The point in time at which something begins to apply",
        possibleValues: [{ dataTypeId: dataTypeVersionUrl }],
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
        possibleValues: [{ dataTypeId: dataTypeVersionUrl }],
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

  const existingServiceFeatureEntities = await getEntitiesByType(
    context,
    authentication,
    {
      entityTypeId: serviceFeatureEntityType.schema.$id,
    },
  );

  for (const {
    serviceName,
    featureName,
    inputUnitCost,
    outputUnitCost,
  } of initialServices) {
    if (
      existingServiceFeatureEntities.some((entity) => {
        const serviceNameProperty =
          entity.properties[serviceNamePropertyType.metadata.recordId.baseUrl];
        const featureNameProperty =
          entity.properties[featureNamePropertyType.metadata.recordId.baseUrl];
        return (
          serviceNameProperty === serviceName &&
          featureNameProperty === featureName
        );
      })
    ) {
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
