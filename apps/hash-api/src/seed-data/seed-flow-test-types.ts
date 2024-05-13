import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
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
        possibleValues: [{ primitiveDataType: "number" }],
      },
      ownedById,
    },
  );

  const unitPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Unit",
        description: "The name of a unit of something",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      ownedById,
    },
  );

  const multiplierPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Multiplier",
        description:
          'The multiplier of something (e.g. "millions", "thousands", etc.)',
        possibleValues: [{ primitiveDataType: "text" }],
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
              [unitPropertyType.metadata.recordId.baseUrl]: {
                $ref: unitPropertyType.schema.$id,
              },
              [multiplierPropertyType.metadata.recordId.baseUrl]: {
                $ref: multiplierPropertyType.schema.$id,
              },
            },
            propertyTypeObjectRequiredProperties: [
              measuredOnPropertyType.metadata.recordId.baseUrl,
              valuePropertyType.metadata.recordId.baseUrl,
              unitPropertyType.metadata.recordId.baseUrl,
            ],
          },
        ],
      },
      ownedById,
    });

  const numberOfVotingRightsPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Number of Voting Rights",
        description:
          "The number of voting rights of a company, usually expressed as the total count of shares held by an entity that are eligible to vote in corporate decisions.",
        possibleValues: [
          {
            propertyTypeObjectProperties: {
              [valuePropertyType.metadata.recordId.baseUrl]: {
                $ref: valuePropertyType.schema.$id,
              },
              [unitPropertyType.metadata.recordId.baseUrl]: {
                $ref: unitPropertyType.schema.$id,
              },
            },
            propertyTypeObjectRequiredProperties: [
              valuePropertyType.metadata.recordId.baseUrl,
              unitPropertyType.metadata.recordId.baseUrl,
            ],
          },
        ],
      },
      ownedById,
    });

  const ownershipPercentagePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Ownership Percentage",
        description:
          "The proportion of the total available capital of a company that is owned by a specific shareholder, reflecting their relative financial stake and potential influence in corporate governance.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      ownedById,
    });

  const holdingTypePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Holding Type",
        description:
          "The method or structure through which a shareholder possesses shares, indicating whether the interest is direct, indirect, or through financial instruments such as derivatives.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      ownedById,
    },
  );

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
            propertyType: numberOfVotingRightsPropertyType.schema.$id,
          },
          {
            propertyType: ownershipPercentagePropertyType.schema.$id,
          },
          {
            propertyType: holdingTypePropertyType.schema.$id,
          },
          {
            propertyType: measuredOnPropertyType.schema.$id,
          },
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

  /**
   * This is a generic company entity type to allow
   * 1. for identifying companies that are invested in an index but are not constituents of an index
   * 2. for identifying companies that a person worked at
   */
  const companyEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Company",
        description: "A company",
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

  const rolePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Role",
        description: "The name of a role performed by someone or something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      ownedById,
    },
  );

  const workedAtLinkType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Worked At",
        description: "Somewhere that someone or something worked at",
        properties: [
          {
            propertyType: systemPropertyTypes.appliesFrom.propertyTypeId,
            required: false,
          },
          {
            propertyType: systemPropertyTypes.appliesUntil.propertyTypeId,
            required: false,
          },
          {
            propertyType: rolePropertyType.schema.$id,
            required: false,
          },
        ],
      },
      ownedById,
    },
  );

  const linkedinUrlPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "LinkedIn URL",
        description: "A URL to a LinkedIn profile",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      ownedById,
    },
  );

  const googleScholarUrlPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Google Scholar URL",
        description: "A URL to a Google Scholar profile",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      ownedById,
    });

  const twitterUrlPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Twitter URL",
        description: "A URL to a Twitter account",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      ownedById,
    },
  );

  const githubUrlPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "GitHub URL",
        description: "A URL to a GitHub account",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      ownedById,
    },
  );

  /**
   * This is a Person entity type for testing scraping of common fields one might want for a person.
   * This is a simplified representation – for employment, for example, you would probably actually
   * want separate entities for companies, and a link entity type for the employment relationship between them.
   */
  const _personEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Person",
        description: "A human person",
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
            propertyType: systemPropertyTypes.email.propertyTypeId,
            required: false,
          },
          {
            propertyType: linkedinUrlPropertyType.schema.$id,
            required: false,
          },
          {
            propertyType: googleScholarUrlPropertyType.schema.$id,
            required: false,
          },
          {
            propertyType: twitterUrlPropertyType.schema.$id,
            required: false,
          },
          {
            propertyType: githubUrlPropertyType.schema.$id,
            required: false,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: workedAtLinkType,
            destinationEntityTypes: [companyEntityType],
          },
        ],
      },
      ownedById,
    },
  );
};

await seedFlowTestTypes();
