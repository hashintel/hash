import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { EnforcedEntityEditionProvenance } from "@local/hash-graph-sdk/entity";
import type {
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  defaultEntityTypeAuthorizationRelationships,
  defaultPropertyTypeAuthorizationRelationships,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { EntityTypeRelationAndSubject , linkEntityTypeUrl } from "@local/hash-subgraph";
import { versionedUrlFromComponents } from "@local/hash-subgraph/type-system-patch";

import type { ImpureGraphFunction } from "../graph/context-types";
import type {
  EntityTypeDefinition,
  generateSystemEntityTypeSchema,
  generateSystemPropertyTypeSchema,
  generateSystemTypeBaseUrl,  PropertyTypeDefinition} from "../graph/ensure-system-graph-is-initialized/migrate-ontology-types/util";
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

const provenance: EnforcedEntityEditionProvenance = {
  actorType: "machine",
  origin: {
    type: "migration",
  },
};

const webShortname = "hash";
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
 * When this script is deleted, also remove 'ftse' from getEntityTypeBaseUrl in the frontend.
 */
const seedFlowTestTypes = async () => {
  const graphApi = createGraphClient(logger, {
    host: getRequiredEnv("HASH_GRAPH_API_HOST"),
    port: parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10),
  });

  const context = { graphApi, provenance };

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
   * 1. For identifying companies that are invested in an index but are not constituents of an index
   * 2. For identifying companies that a person worked at.
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

  const hashOrg = await getOrgByShortname(context, authentication, {
    shortname: "hash",
  });

  if (!hashOrg) {
    throw new Error("Hash org not found");
  }

  const hashOwnedById = hashOrg.accountGroupId as OwnedById;

  const rolePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Role",
        description: "The name of a role performed by someone or something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      ownedById: hashOwnedById,
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
      ownedById: hashOwnedById,
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
      ownedById: hashOwnedById,
    },
  );

  const googleScholarUrlPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Google Scholar URL",
        description: "A URL to a Google Scholar profile",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      ownedById: hashOwnedById,
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
      ownedById: hashOwnedById,
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
      ownedById: hashOwnedById,
    },
  );

  /**
   * This is a Person entity type for testing scraping of common fields one might want for a person.
   * This is a simplified representation – for employment, for example, you would probably actually
   * want separate entities for companies, and a link entity type for the employment relationship between them.
   */
  const personEntityType = await createSystemEntityTypeIfNotExists(
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
      ownedById: hashOwnedById,
    },
  );

  const hasAuthorLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has Author",
        description: "Something that has an author",
        properties: [
          {
            propertyType: systemPropertyTypes.appliesFrom.propertyTypeId,
            required: false,
          },
          {
            propertyType: systemPropertyTypes.appliesUntil.propertyTypeId,
            required: false,
          },
        ],
      },
      ownedById: hashOwnedById,
    },
  );

  const _researchPaperType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Research Paper",
        description: "A research paper",
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
            linkEntityType: hasAuthorLinkEntityType,
            destinationEntityTypes: [personEntityType],
          },
        ],
      },
      ownedById: hashOwnedById,
    },
  );

  const _article = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Article",
        description: "A article about something.",
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
          },
          {
            propertyType: blockProtocolPropertyTypes.description.propertyTypeId,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: hasAuthorLinkEntityType,
            destinationEntityTypes: [personEntityType],
          },
        ],
      },
      ownedById: hashOwnedById,
    },
  );

  const largeLanguageModelProviderEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Large Language Model Provider",
        description: "An entity that provides large language models.",
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
      ownedById: hashOwnedById,
    });

  const contextSizePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Context Size",
        description: "The maximum context size the model can handle.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      ownedById: hashOwnedById,
    },
  );

  const inputTokenCostPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Input Token Cost",
        description: "The cost per input token for using the model.",
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
      ownedById: hashOwnedById,
    },
  );

  const outputTokenCostPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Output Token Cost",
        description: "The cost per output token for using the model.",
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
      ownedById: hashOwnedById,
    },
  );

  const trainingDataCutoffDatePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Training Data Cutoff Date",
        description:
          "The date until which the training data was included for the model.",
        possibleValues: [{ dataTypeId: systemDataTypes.date.dataTypeId }],
      },
      ownedById: hashOwnedById,
    });

  const providedByLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Provided By",
        description: "Something that is provided by something else.",
        properties: [],
      },
      ownedById: hashOwnedById,
    },
  );

  const _largeLanguageModelEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Large Language Model",
        description: "A large language model.",
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
            propertyType: contextSizePropertyType.schema.$id,
            required: false,
          },
          {
            propertyType: inputTokenCostPropertyType.schema.$id,
            required: false,
          },
          {
            propertyType: outputTokenCostPropertyType.schema.$id,
            required: false,
          },
          {
            propertyType: trainingDataCutoffDatePropertyType.schema.$id,
            required: false,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: providedByLinkEntityType,
            destinationEntityTypes: [largeLanguageModelProviderEntityType],
          },
        ],
      },
      ownedById: hashOwnedById,
    },
  );

  const nvidiaCUDACoresPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "NVIDIA CUDA Cores",
        description: "Number of NVIDIA CUDA cores.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      ownedById: hashOwnedById,
    },
  );

  const baseClockPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Base Clock",
        description: "Base clock speed in GHz.",
        possibleValues: [{ dataTypeId: systemDataTypes.gigahertz.dataTypeId }],
      },
      ownedById: hashOwnedById,
    },
  );

  const boostClockPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Boost Clock",
        description: "Boost clock speed in GHz.",
        possibleValues: [{ dataTypeId: systemDataTypes.gigahertz.dataTypeId }],
      },
      ownedById: hashOwnedById,
    },
  );

  const memorySizePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Memory Size",
        description: "Memory size in GB.",
        possibleValues: [{ dataTypeId: systemDataTypes.gigabytes.dataTypeId }],
      },
      ownedById: hashOwnedById,
    },
  );

  const memoryTypePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Memory Type",
        description: "Type of memory.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      ownedById: hashOwnedById,
    },
  );

  const rayTracingCoresPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Ray Tracing Cores",
        description: "Number of ray tracing cores.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      ownedById: hashOwnedById,
    },
  );

  const tensorCoresPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Tensor Cores",
        description: "Number of tensor cores.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      ownedById: hashOwnedById,
    },
  );

  const widthPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Width",
        description: "Width in mm.",
        possibleValues: [
          { dataTypeId: systemDataTypes.millimeters.dataTypeId },
        ],
      },
      ownedById: hashOwnedById,
    },
  );

  const lengthPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Length",
        description: "Length in mm.",
        possibleValues: [
          { dataTypeId: systemDataTypes.millimeters.dataTypeId },
        ],
      },
      ownedById: hashOwnedById,
    },
  );

  const powerDrawPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Power Draw",
        description: "Power draw in watts.",
        possibleValues: [{ dataTypeId: systemDataTypes.watts.dataTypeId }],
      },
      ownedById: hashOwnedById,
    },
  );

  const trainingStartDate = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Training Start Date",
        description: "The date on which a thing's training began",
        possibleValues: [{ dataTypeId: systemDataTypes.date.dataTypeId }],
      },
      ownedById: hashOwnedById,
    },
  );

  const trainingEndDate = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Training End Date",
        description: "The date on which a thing's training ended",
        possibleValues: [{ dataTypeId: systemDataTypes.date.dataTypeId }],
      },
      ownedById: hashOwnedById,
    },
  );

  const tokenOutputSpeed = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Token Output Speed",
        description:
          'The rate at which an AI model is able to output tokens (generally, although not always, specified as "tokens per second")',
        possibleValues: [{ primitiveDataType: "text" }],
      },
      ownedById: hashOwnedById,
    },
  );

  const contextWindow = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Context Window",
        description:
          "The maximum number of tokens that an AI model can operate on, including both its inputs and outputs.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      ownedById: hashOwnedById,
    },
  );

  const _aiModelEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "AI Model",
        description:
          "An AI model is a program that has been trained on a set of data to recognize certain patterns and produce certain outputs (e.g. text, images, code, decisions) without further human intervention.",
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
            propertyType: systemPropertyTypes.inputUnitCost.propertyTypeId,
          },
          {
            propertyType: systemPropertyTypes.outputUnitCost.propertyTypeId,
          },
          {
            propertyType: trainingStartDate,
          },
          {
            propertyType: trainingEndDate,
          },
          {
            propertyType: tokenOutputSpeed,
          },
          {
            propertyType: contextWindow,
          },
        ],
      },
      ownedById: hashOwnedById,
    },
  );

  const _graphicsCardEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Graphics Card",
        description: "A graphics card entity type.",
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
            propertyType: nvidiaCUDACoresPropertyType.schema.$id,
            required: false,
          },
          { propertyType: baseClockPropertyType.schema.$id, required: false },
          { propertyType: boostClockPropertyType.schema.$id, required: false },
          { propertyType: memorySizePropertyType.schema.$id, required: false },
          { propertyType: memoryTypePropertyType.schema.$id, required: false },
          {
            propertyType: rayTracingCoresPropertyType.schema.$id,
            required: false,
          },
          { propertyType: tensorCoresPropertyType.schema.$id, required: false },
          { propertyType: widthPropertyType.schema.$id, required: false },
          { propertyType: lengthPropertyType.schema.$id, required: false },
          { propertyType: powerDrawPropertyType.schema.$id, required: false },
        ],
      },
      ownedById: hashOwnedById,
    },
  );
};

await seedFlowTestTypes();
