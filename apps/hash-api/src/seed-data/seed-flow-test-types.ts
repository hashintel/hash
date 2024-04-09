import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import {
  defaultEntityTypeAuthorizationRelationships,
  defaultPropertyTypeAuthorizationRelationships,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  EntityTypeRelationAndSubject,
  EntityTypeWithMetadata,
  OwnedById,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { linkEntityTypeUrl } from "@local/hash-subgraph";
import { versionedUrlFromComponents } from "@local/hash-subgraph/type-system-patch";

import { publicUserAccountId } from "../auth/public-user-account-id";
import type { ImpureGraphFunction } from "../graph/context-types";
import type {
  EntityTypeDefinition,
  PropertyTypeDefinition,
} from "../graph/ensure-system-graph-is-initialized/migrate-ontology-types/util";
import {
  generateSystemEntityTypeSchema,
  generateSystemPropertyTypeSchema,
  generateSystemTypeBaseUrl,
} from "../graph/ensure-system-graph-is-initialized/migrate-ontology-types/util";
import {
  createOrg,
  getOrgByShortname,
} from "../graph/knowledge/system-types/org";
import {
  createEntityType,
  getEntityTypeById,
} from "../graph/ontology/primitive/entity-type";
import {
  createPropertyType,
  getPropertyTypeById,
} from "../graph/ontology/primitive/property-type";
import { logger } from "../logger";

const webShortname = "ftse";
const createSystemPropertyTypeIfNotExists: ImpureGraphFunction<
  {
    propertyTypeDefinition: Omit<PropertyTypeDefinition, "propertyTypeId">;
    ownedById: OwnedById;
  },
  Promise<PropertyTypeWithMetadata>
> = async (context, authentication, { propertyTypeDefinition, ownedById }) => {
  const { title } = propertyTypeDefinition;

  const baseUrl = generateSystemTypeBaseUrl({
    kind: "property-type",
    title,
    // @ts-expect-error -- temporary seeding script
    shortname: webShortname,
  });

  const versionNumber = 1;

  const propertyTypeId = versionedUrlFromComponents(baseUrl, versionNumber);

  const existingPropertyType = await getPropertyTypeById(
    context,
    authentication,
    { propertyTypeId },
  ).catch((error: Error) => {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  });

  if (existingPropertyType) {
    return existingPropertyType;
  }

  const propertyTypeSchema = generateSystemPropertyTypeSchema({
    ...propertyTypeDefinition,
    propertyTypeId,
  });

  const createdPropertyType = await createPropertyType(
    context,
    authentication,
    {
      ownedById,
      schema: propertyTypeSchema,
      webShortname,
      relationships: defaultPropertyTypeAuthorizationRelationships,
    },
  ).catch((createError) => {
    throw createError;
  });

  return createdPropertyType;
};

const createSystemEntityTypeIfNotExists: ImpureGraphFunction<
  {
    entityTypeDefinition: Omit<EntityTypeDefinition, "entityTypeId">;
    ownedById: OwnedById;
  },
  Promise<EntityTypeWithMetadata>
> = async (context, authentication, { entityTypeDefinition, ownedById }) => {
  const { title } = entityTypeDefinition;
  const baseUrl = generateSystemTypeBaseUrl({
    kind: "entity-type",
    title,
    // @ts-expect-error -- temporary seeding script
    shortname: webShortname,
  });

  const versionNumber = 1;

  const entityTypeId = versionedUrlFromComponents(baseUrl, versionNumber);

  const existingEntityType = await getEntityTypeById(context, authentication, {
    entityTypeId,
  }).catch((error: Error) => {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  });

  if (existingEntityType) {
    return existingEntityType;
  }

  const entityTypeSchema = generateSystemEntityTypeSchema({
    ...entityTypeDefinition,
    entityTypeId,
  });

  const relationships: EntityTypeRelationAndSubject[] =
    defaultEntityTypeAuthorizationRelationships;

  const createdEntityType = await createEntityType(context, authentication, {
    ownedById,
    schema: entityTypeSchema,
    webShortname,
    relationships,
  }).catch((createError) => {
    throw createError;
  });

  return createdEntityType;
};

/**
 * When this script is deleted, also remove 'ftse' from getEntityTypeBaseUrl in the frontend
 */
const seedFlowTestTypes = async () => {
  const graphApi = createGraphClient(logger, {
    host: getRequiredEnv("HASH_GRAPH_API_HOST"),
    port: parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10),
  });

  const context = { graphApi };

  const hashBotActorId = await getMachineActorId(
    context,
    { actorId: publicUserAccountId },
    { identifier: "hash" },
  );

  const authentication = { actorId: hashBotActorId };

  let org = await getOrgByShortname(context, authentication, {
    shortname: webShortname,
  });

  if (!org) {
    org = await createOrg(context, authentication, {
      shortname: webShortname,
      name: "FTSE",
    });
  }

  const ownedById = org.accountGroupId as OwnedById;

  const valuePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Value",
        description: "The value of something",
        possibleValues: [{ dataTypeId: systemDataTypes.usd.dataTypeId }],
      },
      ownedById,
    },
  );

  const measuredOnPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Measured On",
        description: "The date and time at which something was measured.",
        possibleValues: [{ dataTypeId: systemDataTypes.datetime.dataTypeId }],
      },
      ownedById,
    },
  );

  const marketCapitalizationPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Market Capitalization",
        description: "The market capitalization of a company.",
        possibleValues: [
          {
            propertyTypeObjectProperties: {
              [measuredOnPropertyType.metadata.recordId.baseUrl]: {
                $ref: measuredOnPropertyType.schema.$id,
              },
              [valuePropertyType.metadata.recordId.baseUrl]: {
                $ref: valuePropertyType.schema.$id,
              },
            },
            propertyTypeObjectRequiredProperties: [
              measuredOnPropertyType.metadata.recordId.baseUrl,
              valuePropertyType.metadata.recordId.baseUrl,
            ],
          },
        ],
      },
      ownedById,
    });

  const investedInLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Invested In",
        description: "Something that something is invested in",
        properties: [
          {
            propertyType: valuePropertyType.schema.$id,
            required: true,
          },
          { propertyType: measuredOnPropertyType.schema.$id },
        ],
      },
      ownedById,
    },
  );

  const appearsInIndexLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Appears In Index",
        description: "The index that something appears in.",
        properties: [
          {
            propertyType: systemPropertyTypes.appliesFrom.propertyTypeId,
            required: true,
          },
          { propertyType: systemPropertyTypes.appliesUntil.propertyTypeId },
        ],
      },
      ownedById,
    },
  );

  const stockMarketIndexEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Stock Market Index",
        description: "A stock market index.",
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
            required: true,
          },
        ],
      },
      ownedById,
    },
  );

  const stockMarketConstituentEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Stock Market Constituent",
        description: "A stock market constituent.",
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
            propertyType: marketCapitalizationPropertyType.schema.$id,
            array: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: appearsInIndexLinkEntityType,
            destinationEntityTypes: [stockMarketIndexEntityType],
          },
          {
            linkEntityType: investedInLinkEntityType,
            destinationEntityTypes: ["SELF_REFERENCE"],
          },
        ],
      },
      ownedById,
    });

  const _investmentFundEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Investment Fund",
        description: "An investment fund.",
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: investedInLinkEntityType,
            destinationEntityTypes: [stockMarketConstituentEntityType],
          },
        ],
      },
      ownedById,
    },
  );
};

await seedFlowTestTypes();
