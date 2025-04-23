import {
  type EntityTypeWithMetadata,
  type PropertyTypeWithMetadata,
  type ProvidedEntityEditionProvenance,
  versionedUrlFromComponents,
  type WebId,
} from "@blockprotocol/type-system";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getMachineIdByIdentifier } from "@local/hash-backend-utils/machine-actors";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { EntityTypeRelationAndSubject } from "@local/hash-graph-client/dist/api.d";
import {
  defaultEntityTypeAuthorizationRelationships,
  defaultPropertyTypeAuthorizationRelationships,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolEntityTypes,
  blockProtocolPropertyTypes,
  systemDataTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

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

const provenance: ProvidedEntityEditionProvenance = {
  actorType: "machine",
  origin: {
    type: "migration",
  },
};

const webShortname = "h";
const createSystemPropertyTypeIfNotExists: ImpureGraphFunction<
  {
    propertyTypeDefinition: Omit<PropertyTypeDefinition, "propertyTypeId">;
    webId: WebId;
  },
  Promise<PropertyTypeWithMetadata>
> = async (context, authentication, { propertyTypeDefinition, webId }) => {
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
      webId,
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
    webId: WebId;
  },
  Promise<EntityTypeWithMetadata>
> = async (context, authentication, { entityTypeDefinition, webId }) => {
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
    webId,
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
    host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
    port: Number.parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
  });

  const context = { graphApi, provenance };

  const hashBotActorId = await getMachineIdByIdentifier(
    context,
    { actorId: publicUserAccountId },
    { identifier: "h" },
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

  const webId = org.webId;

  const valuePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Value",
        description: "The value of something",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webId,
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
      webId,
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
      webId,
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
      webId,
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
      webId,
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
      webId,
    });

  const ownershipPercentagePropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Ownership Percentage",
        description:
          "The proportion of the total available capital of a company that is owned by a specific shareholder, reflecting their relative financial stake and potential influence in corporate governance.",
        possibleValues: [{ primitiveDataType: "number" }],
      },
      webId,
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
      webId,
    },
  );

  const investedInLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
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
      webId,
    },
  );

  const appearsInIndexLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
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
      webId,
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
      webId,
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
      webId,
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
      webId,
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
      webId,
    },
  );

  const hashOrg = await getOrgByShortname(context, authentication, {
    shortname: "h",
  });

  if (!hashOrg) {
    throw new Error("HASH org not found");
  }

  const hashWebId = hashOrg.webId;

  const rolePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Role",
        description: "The name of a role performed by someone or something.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webId: hashWebId,
    },
  );

  const workedAtLinkType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
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
      webId: hashWebId,
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
      webId: hashWebId,
    },
  );

  const googleScholarUrlPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Google Scholar URL",
        description: "A URL to a Google Scholar profile",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
            array: true,
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
      webId: hashWebId,
    },
  );

  const hasAuthorLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
    });

  const providedByLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Provided By",
        description: "Something that is provided by something else.",
        properties: [],
      },
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
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
      webId: hashWebId,
    },
  );
};

await seedFlowTestTypes();
