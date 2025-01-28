import { type VersionedUrl } from "@blockprotocol/type-system";
import { Storage } from "@google-cloud/storage";
import type { Part, ResponseSchema } from "@google-cloud/vertexai";
import { SchemaType, VertexAI } from "@google-cloud/vertexai";
import type { PropertyProvenance } from "@local/hash-graph-client";
import type {
  EntityId,
  PropertyObjectWithMetadata,
  PropertyValue,
  PropertyWithMetadata,
} from "@local/hash-graph-types/entity";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { EntityTypeRootType } from "@local/hash-subgraph";
import { getEntityTypes } from "@local/hash-subgraph/stdlib";
import dedent from "dedent";

import { logger } from "../../shared/activity-logger.js";
import {
  type DereferencedEntityType,
  type DereferencedEntityTypeWithSimplifiedKeys,
  dereferenceEntityType,
  type MinimalPropertyObject,
} from "../../shared/dereference-entity-type.js";
import { getFlowContext } from "../../shared/get-flow-context.js";
import { graphApiClient } from "../../shared/graph-api-client.js";

const generateOutputSchema = (
  dereferencedDocEntityTypes: DereferencedEntityType[],
): ResponseSchema => {
  const rawSchema = {
    type: SchemaType.OBJECT,
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
              type: SchemaType.OBJECT,
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
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            affiliatedWith: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.STRING,
              },
              description:
                "Any institution(s) or organization(s) that the document identifies the author as being affiliated with",
            },
            name: {
              description: "The name of the author",
              type: SchemaType.STRING,
            },
          },
        },
      },
    },
  };

  // @ts-expect-error -- we could fix this by making {@link transformSchemaForGoogle} types more precise
  return transformSchemaForGoogle(rawSchema);
};

type DocumentMetadataWithSimplifiedProperties = {
  entityTypeId: VersionedUrl;
} & Record<string, PropertyValue>;

type LlmResponseDocumentData = {
  authors?: { name: string; affiliatedWith?: string[] }[];
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

  const propertyType = propertyObjectSchema[key];

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

  const propertyProvenance: PropertyProvenance = {
    sources: [
      {
        authors: rest.authors?.map((author) => author.name),
        type: "document",
        entityId: provenance.entityId,
        location: { uri: provenance.fileUrl },
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

const googleCloudProjectId = process.env.GOOGLE_CLOUD_HASH_PROJECT_ID;

let _vertexAi: VertexAI | undefined;

export const getVertexAi = () => {
  if (!googleCloudProjectId) {
    throw new Error(
      "GOOGLE_CLOUD_HASH_PROJECT_ID environment variable is not set",
    );
  }

  if (_vertexAi) {
    return _vertexAi;
  }

  const vertexAI = new VertexAI({
    project: googleCloudProjectId,
    location: "us-east4",
  });

  _vertexAi = vertexAI;

  return vertexAI;
};

let _googleCloudStorage: Storage | undefined;

export const storageBucket = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;

const getGoogleCloudStorage = () => {
  if (_googleCloudStorage) {
    return _googleCloudStorage;
  }

  const storage = new Storage();
  _googleCloudStorage = storage;

  return storage;
};

export const getLlmAnalysisOfDoc = async ({
  hashFileStorageKey,
  fileSystemPath,
  entityId,
  fileUrl,
}: {
  hashFileStorageKey: string;
  fileSystemPath: string;
  entityId: EntityId;
  fileUrl: string;
}): Promise<DocumentData> => {
  if (!storageBucket) {
    throw new Error(
      "GOOGLE_CLOUD_STORAGE_BUCKET environment variable is not set",
    );
  }

  const { userAuthentication } = await getFlowContext();

  const docsEntityTypeSubgraph = await graphApiClient
    .getEntityTypeSubgraph(userAuthentication.actorId, {
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
      includeDrafts: false,

      temporalAxes: currentTimeInstantTemporalAxes,
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        constrainsLinkDestinationsOn: { outgoing: 255 },
        constrainsLinksOn: { outgoing: 255 },
        constrainsValuesOn: { outgoing: 255 },
        constrainsPropertiesOn: { outgoing: 255 },
        inheritsFrom: { outgoing: 255 },
      },
    })
    .then(({ data: response }) =>
      mapGraphApiSubgraphToSubgraph<EntityTypeRootType>(
        response.subgraph,
        userAuthentication.actorId,
      ),
    );

  // const docEntityTypes
  const dereferencedDocEntityTypes = getEntityTypes(docsEntityTypeSubgraph)
    .map((entityType) =>
      dereferenceEntityType({
        entityTypeId: entityType.schema.$id,
        subgraph: docsEntityTypeSubgraph,
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

  const vertexAi = getVertexAi();

  const gemini = vertexAi.getGenerativeModel({
    model: "gemini-1.5-pro",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  const storage = getGoogleCloudStorage();

  const cloudStorageFilePath = `gs://${storageBucket}/${hashFileStorageKey}`;

  try {
    await storage.bucket(storageBucket).file(hashFileStorageKey).getMetadata();

    logger.info(
      `Already exists in Google Cloud Storage: HASH key ${hashFileStorageKey} in ${storageBucket} bucket`,
    );
  } catch (err) {
    if ("code" in (err as Error) && (err as { code: unknown }).code === 404) {
      await storage
        .bucket(storageBucket)
        .upload(fileSystemPath, { destination: hashFileStorageKey });
      logger.info(
        `Uploaded to Google Cloud Storage: HASH key ${hashFileStorageKey} in ${storageBucket} bucket`,
      );
    } else {
      throw err;
    }
  }

  const filePart: Part = {
    fileData: {
      fileUri: cloudStorageFilePath,
      mimeType: "application/pdf",
    },
  };

  const textPart = {
    text: dedent(`Please provide metadata about this document, using only the information visible in the document.
    
    You are given multiple options of what type of document this might be, and must choose from them.

    The options are:
    
    ${dereferencedDocEntityTypes.map((type) => `- ${type.schema.title}`).join("\n")}

    'Doc' is the most generic type. Use this if no other more specific type is appropriate.
    
    If you're not confident about any of the metadata fields, omit them.`),
  };

  const request = {
    contents: [{ role: "user", parts: [filePart, textPart] }],
  };

  /**
   * @todo H-3922 add usage tracking for Gemini models
   *
   * Documents count as 258 tokens per page.
   */
  const resp = await gemini.generateContent(request);

  const contentResponse = resp.response.candidates?.[0]?.content.parts[0]?.text;

  if (!contentResponse) {
    throw new Error("No content response from LLM analysis");
  }

  const parsedResponse: unknown = JSON.parse(contentResponse);

  return unsimplifyDocumentMetadata(
    parsedResponse,
    dereferencedDocEntityTypes,
    {
      entityId,
      fileUrl,
    },
  );
};
