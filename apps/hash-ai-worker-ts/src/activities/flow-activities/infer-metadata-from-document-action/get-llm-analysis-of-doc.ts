import { getEntityTypes } from "@blockprotocol/graph/stdlib";
import type {
  EntityId,
  PropertyObjectWithMetadata,
  PropertyProvenance,
  PropertyValue,
  PropertyWithMetadata,
  Url,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { SchemaType } from "@google-cloud/vertexai";
import { sleep } from "@local/hash-backend-utils/utils";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { queryEntityTypeSubgraph } from "@local/hash-graph-sdk/entity-type";
import {
  almostFullOntologyResolveDepths,
  currentTimeInstantTemporalAxes,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { File } from "@local/hash-isomorphic-utils/system-types/shared";
import dedent from "dedent";
import get from "lodash/get.js";
import set from "lodash/set.js";
import unset from "lodash/unset.js";

import { logger } from "../../shared/activity-logger.js";
import {
  type DereferencedEntityType,
  type DereferencedEntityTypeWithSimplifiedKeys,
  dereferenceEntityType,
  type MinimalPropertyObject,
} from "../../shared/dereference-entity-type.js";
import { getFlowContext } from "../../shared/get-flow-context.js";
import { getLlmResponse } from "../../shared/get-llm-response.js";
import {
  getToolCallsFromLlmAssistantMessage,
  type LlmFileMessageContent,
  type LlmMessageTextContent,
  type LlmUserMessage,
} from "../../shared/get-llm-response/llm-message.js";
import type {
  LlmParams,
  LlmToolDefinition,
} from "../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../shared/graph-api-client.js";
import { judgeAiOutputs } from "../../shared/judge-ai-outputs.js";

const generateOutputSchema = (
  dereferencedDocEntityTypes: DereferencedEntityType[],
) => {
  return {
    type: "object",
    additionalProperties: false as const,
    properties: {
      documentMetadata: {
        anyOf: dereferencedDocEntityTypes.map(
          ({
            labelProperty: _,
            links: __,
            title,
            $id,
            properties,
            required,
          }) => {
            return {
              type: "object",
              title,
              properties: {
                entityTypeId: { type: SchemaType.STRING, enum: [$id] },
                ...properties,
              },
              required: [...(required ?? []), "entityTypeId"],
            };
          },
        ),
      },
      authors: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false as const,
          properties: {
            affiliatedWith: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "Any institution(s) or organization(s) that the document identifies the author as being affiliated with",
            },
            name: {
              description: "The name of the author",
              type: "string",
            },
            email: {
              description: "The email address of the author",
              type: "string",
            },
          },
          required: ["name"],
        },
      },
    },
  } satisfies LlmToolDefinition["inputSchema"];
};

type DocumentMetadataWithSimplifiedProperties = {
  entityTypeId: VersionedUrl;
} & Record<string, PropertyValue>;

type LlmResponseDocumentData = {
  authors?: { name: string; email?: string; affiliatedWith?: string[] }[];
  documentMetadata: DocumentMetadataWithSimplifiedProperties;
};

export type DocumentData = Omit<LlmResponseDocumentData, "documentMetadata"> & {
  documentMetadata: {
    entityTypeId: VersionedUrl;
    properties: PropertyObjectWithMetadata;
  };
};

const assertIsLlmResponseDocumentData: (
  input: unknown,
) => asserts input is LlmResponseDocumentData = (input) => {
  if (typeof input !== "object" || input === null) {
    throw new Error("Input is not an object");
  }

  if (
    !("documentMetadata" in input) ||
    typeof input.documentMetadata !== "object" ||
    input.documentMetadata === null
  ) {
    throw new Error("input.documentMetadata is not an object");
  }

  const { entityTypeId } =
    input.documentMetadata as DocumentData["documentMetadata"];

  if (typeof entityTypeId !== "string") {
    throw new Error("input.documentMetadata.entityTypeId is not a string");
  }
};

const addMetadataToPropertyValue = (
  key: string,
  value: PropertyValue,
  propertyMappings: DereferencedEntityTypeWithSimplifiedKeys["simplifiedPropertyTypeMappings"],
  propertyObjectSchema:
    | DereferencedEntityTypeWithSimplifiedKeys["schema"]["properties"]
    | MinimalPropertyObject["properties"],
  provenance: PropertyProvenance,
): PropertyWithMetadata => {
  const propertyTypeBaseUrl = propertyMappings[key];

  if (!propertyTypeBaseUrl) {
    throw new Error(
      `Simplified property type mapping for key ${key} not found`,
    );
  }

  const propertyType = (
    propertyObjectSchema as DereferencedEntityTypeWithSimplifiedKeys["schema"]["properties"]
  )[key];

  if (!propertyType) {
    throw new Error(
      `Property type for key ${key} not found in dereferenced entity type`,
    );
  }

  const isArray = "items" in propertyType;

  const propertyTypeOneOf = isArray
    ? propertyType.items.oneOf
    : propertyType.oneOf;

  if (propertyTypeOneOf.length !== 1) {
    throw new Error(
      `Property type for key ${key} has ${propertyTypeOneOf.length} oneOf options, expected 1.`,
    );
  }

  const propertyTypeSchema = propertyTypeOneOf[0];

  if (isArray) {
    if (!Array.isArray(value)) {
      throw new Error(
        `Property type for key ${key} is array, but value '${stringifyPropertyValue(value)}' is not an array`,
      );
    }

    if ("properties" in propertyTypeSchema) {
      return {
        value: value.map((objectInArray, index) => {
          if (
            typeof objectInArray !== "object" ||
            objectInArray === null ||
            Array.isArray(objectInArray)
          ) {
            throw new Error(
              `Property type for key ${key} is array of objects, but value at index ${index} '${stringifyPropertyValue(objectInArray)}' is not an object`,
            );
          }

          return {
            value: Object.fromEntries(
              Object.entries(objectInArray).map(([nestedKey, nestedValue]) => {
                const nestedBaseUrl = propertyMappings[nestedKey];

                if (!nestedBaseUrl) {
                  throw new Error(
                    `Simplified property type mapping for key ${nestedKey} not found`,
                  );
                }

                return [
                  nestedBaseUrl,
                  addMetadataToPropertyValue(
                    nestedKey,
                    nestedValue,
                    propertyMappings,
                    propertyTypeSchema.properties,
                    provenance,
                  ),
                ];
              }),
            ),
          };
        }),
      };
    }

    if ("$id" in propertyTypeSchema) {
      return {
        value: value.map((item) => ({
          value: item,
          metadata: { dataTypeId: propertyTypeSchema.$id, provenance },
        })),
      };
    }

    const expectedDataType = propertyTypeSchema.items.oneOf[0];

    if (!("$id" in expectedDataType)) {
      throw new Error(
        `Property type for key ${key} has unsupported schema: ${JSON.stringify(propertyTypeSchema)}`,
      );
    }

    return {
      value: value.map((item) => ({
        value: item,
        metadata: { dataTypeId: expectedDataType.$id, provenance },
      })),
    };
  }

  if ("properties" in propertyTypeSchema) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(
        `Property type for key ${key} is object, but value ${stringifyPropertyValue(value)} is not an object`,
      );
    }

    return {
      value: Object.fromEntries(
        Object.entries(value).map(([nestedKey, nestedValue]) => {
          const nestedBaseUrl = propertyMappings[nestedKey];

          if (!nestedBaseUrl) {
            throw new Error(
              `Simplified property type mapping for key ${nestedKey} not found`,
            );
          }

          return [
            nestedBaseUrl,
            addMetadataToPropertyValue(
              nestedKey,
              nestedValue,
              propertyMappings,
              propertyTypeSchema.properties,
              provenance,
            ),
          ];
        }),
      ),
    };
  }

  if ("$id" in propertyTypeSchema) {
    return {
      value,
      metadata: { dataTypeId: propertyTypeSchema.$id, provenance },
    };
  }

  const expectedDataType = propertyTypeSchema.items.oneOf[0];

  if (!("$id" in expectedDataType)) {
    throw new Error(
      `Property type for key ${key} has unsupported schema: ${JSON.stringify(propertyTypeSchema)}`,
    );
  }

  if (!Array.isArray(value)) {
    throw new Error(
      `Property type for key ${key} is array, but value ${stringifyPropertyValue(value)} is not an array`,
    );
  }

  return {
    value: value.map((item) => ({
      value: item,
      metadata: { dataTypeId: expectedDataType.$id, provenance },
    })),
  };
};

const unsimplifyDocumentMetadata = (
  input: unknown,
  docEntityTypes: DereferencedEntityTypeWithSimplifiedKeys[],
  provenance: {
    entityId: EntityId;
    fileUrl: string;
  },
): DocumentData => {
  assertIsLlmResponseDocumentData(input);

  const { documentMetadata, ...rest } = input;

  const { entityTypeId, ...properties } = documentMetadata;

  const docEntityType = docEntityTypes.find(
    (type) => type.schema.$id === entityTypeId,
  );

  if (!docEntityType) {
    throw new Error(
      `Dereferenced entity type for entityTypeId ${entityTypeId} not found`,
    );
  }

  const title = properties.title as string | undefined;

  const propertyProvenance: PropertyProvenance = {
    sources: [
      {
        authors: rest.authors?.map((author) => author.name),
        type: "document",
        entityId: provenance.entityId,
        location: { uri: provenance.fileUrl as Url, name: title },
      },
    ],
  };

  const fullPropertiesWithDataTypeIds: PropertyObjectWithMetadata = {
    value: {},
  };

  for (const [key, value] of Object.entries(properties)) {
    const propertyTypeBaseUrl =
      docEntityType.simplifiedPropertyTypeMappings[key];

    if (!propertyTypeBaseUrl) {
      throw new Error(
        `Simplified property type mapping for key ${key} not found`,
      );
    }

    fullPropertiesWithDataTypeIds.value[propertyTypeBaseUrl] =
      addMetadataToPropertyValue(
        key,
        value,
        docEntityType.simplifiedPropertyTypeMappings,
        docEntityType.schema.properties,
        propertyProvenance,
      );
  }

  return {
    ...rest,
    documentMetadata: {
      entityTypeId: documentMetadata.entityTypeId,
      properties: fullPropertiesWithDataTypeIds,
    },
  };
};

export const getLlmAnalysisOfDoc = async ({
  fileEntity,
}: {
  fileEntity: HashEntity<File>;
}): Promise<DocumentData> => {
  const { userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const docsEntityType = await queryEntityTypeSubgraph(
    graphApiClient,
    userAuthentication,
    {
      filter: {
        all: [
          {
            equal: [
              {
                path: ["inheritsFrom", "*", "versionedUrl"],
              },
              {
                parameter: systemEntityTypes.doc.entityTypeId,
              },
            ],
          },
        ],
      },

      temporalAxes: currentTimeInstantTemporalAxes,
      graphResolveDepths: {
        ...almostFullOntologyResolveDepths,
        constrainsLinkDestinationsOn: 4,
        constrainsLinksOn: 4,
      },
      traversalPaths: [],
    },
  );

  // const docEntityTypes
  const dereferencedDocEntityTypes = getEntityTypes(docsEntityType.subgraph)
    .map((entityType) =>
      dereferenceEntityType({
        entityTypeId: entityType.schema.$id,
        subgraph: docsEntityType.subgraph,
        simplifyPropertyKeys: true,
      }),
    )
    .filter((type) => {
      return (
        type.schema.$id === systemEntityTypes.doc.entityTypeId ||
        type.parentIds.includes(systemEntityTypes.doc.entityTypeId)
      );
    });

  const schema = generateOutputSchema(
    dereferencedDocEntityTypes.map((type) => type.schema),
  );

  const textContent: LlmMessageTextContent = {
    type: "text",
    text: dedent(`Please provide metadata about this document, using only the information visible in the document.

    You are given multiple options of what type of document this might be, and must choose from them.

    The options are:

    ${dereferencedDocEntityTypes.map((type) => `- ${type.schema.title}`).join("\n")}

    'Doc' is the most generic type. Use this if no other more specific type is appropriate.
    If you can't find a more specific type, use 'Doc'.

    When dealing with dates in the document metadata, use the format YYYY-MM-DD. Bear in mind the document may use a different format.
    Also note the difference between 'estimated'/'predicted' and 'actual'/'confirmed' dates. Either, neither or both may be present.
    Depending on the type of document, this distinction may be important, and the document should give clues as to which dates are which.

    Remember – if you can't determine a specifiy type for the document, use 'Doc'. If you can't find a title, use 'Unknown' as the title.
    `),
  };

  const fileContent: LlmFileMessageContent = {
    type: "file",
    fileEntity: {
      entityId: fileEntity.entityId,
      properties: fileEntity.properties,
    },
  };

  const message: LlmUserMessage = {
    role: "user",
    content: [textContent, fileContent],
  };

  const tools: LlmParams["tools"] = [
    {
      name: "provideDocumentMetadata" as const,
      description: "Provide metadata about the document",
      inputSchema: schema,
    },
  ];

  const response = await getLlmResponse(
    {
      model: "gemini-1.5-pro-002",
      messages: [message],
      toolChoice: "required",
      tools,
    },
    {
      customMetadata: {
        stepId,
        taskName: "infer-metadata-from-document",
      },
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (response.status !== "ok") {
    if (response.status === "aborted") {
      throw new Error("LLM analysis aborted");
    }

    await sleep(2_000);

    logger.error(
      `LLM analysis failed, retrying. ${response.status}: ${
        "message" in response ? response.message : "unknown error"
      }`,
    );
    return getLlmAnalysisOfDoc({ fileEntity });
  }

  const toolCalls = getToolCallsFromLlmAssistantMessage({
    message: response.message,
  });

  const toolCall = toolCalls[0];

  if (!toolCall) {
    logger.error("No tool call found");

    await sleep(2_000);

    return getLlmAnalysisOfDoc({ fileEntity });
  }

  try {
    assertIsLlmResponseDocumentData(toolCall.input);
  } catch (error) {
    logger.error(
      `LLM analysis failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    await sleep(2_000);
    return getLlmAnalysisOfDoc({ fileEntity });
  }

  const judgeVerdict = await judgeAiOutputs({
    exchangeToReview: {
      messages: [message, response.message],
      tools,
    },
    judgeModel: "gemini-1.5-pro-002",
  });

  for (const {
    correctionType,
    jsonPath,
    correctValue,
  } of judgeVerdict.corrections) {
    if (correctionType === "delete-unfounded") {
      unset(response.message, jsonPath);
      logger.info(
        `Judge correction: remove property ${jsonPath.slice(3).join(".")} from output`,
      );
    } else {
      const previousValue = get(response.message, jsonPath) as
        | PropertyValue
        | undefined;

      set(response.message, jsonPath, correctValue);

      logger.info(
        `Judge correction: set property ${jsonPath.slice(3).join(".")} to ${JSON.stringify(correctValue)}.${previousValue !== undefined ? ` (previous value: ${JSON.stringify(previousValue)})` : ""}`,
      );
    }
  }

  return unsimplifyDocumentMetadata(
    toolCall.input,
    dereferencedDocEntityTypes,
    {
      entityId: fileEntity.entityId,
      fileUrl:
        fileEntity.properties[
          "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
        ],
    },
  );
};
