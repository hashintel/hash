import {
  mustHaveAtLeastOne,
  type VersionedUrl,
} from "@blockprotocol/type-system";
import { Storage } from "@google-cloud/storage";
import type { Part, ResponseSchema } from "@google-cloud/vertexai";
import { SchemaType, VertexAI } from "@google-cloud/vertexai";
import type { PropertyProvenance } from "@local/hash-graph-client/dist/api.d";
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
  type DereferencedPropertyType,
  dereferenceEntityType,
  type MinimalPropertyObject,
} from "../../shared/dereference-entity-type.js";
import { getFlowContext } from "../../shared/get-flow-context.js";
import { graphApiClient } from "../../shared/graph-api-client.js";

/**
 * The Vertex AI controlled generation (i.e. output) schema supports a subset of the Vertex AI schema fields,
 * which are themselves a subset of OpenAPI schema fields.
 *
 * Any fields which are supported by Vertex AI but not by controlled generation will be IGNORED.
 * Any fields which are not supported by Vertex AI will result in the request being REJECTED.
 *
 * We want to exclude the fields which will be REJECTED, i.e. are not supported at all by Vertex AI
 *
 * The fields which are IGNORED we allow through. Controlled generation may support them in future,
 * in which case they will automatically start to be accounted for.
 *
 * The fields which are rejected we need to manually remove from this list when we discover that Vertex AI now supports them.
 *
 * There are some fields which are not listed here but instead handled specially in {@link transformSchemaForGoogle},
 * because we can rewrite them to constrain the output (e.g. 'const' can become an enum with a single option).
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output
 */
const vertexSchemaUnsupportedFields = ["$id", "multipleOf", "pattern"] as const;

/**
 * These are special fields we use in HASH but do not appear in any JSON Schema spec.
 * They will never be supported in Vertex AI, so we must remove them.
 */
const nonStandardSchemaFields = [
  "abstract",
  "titlePlural",
  "kind",
  "labelProperty",
  "inverse",
];

const fieldsToExclude = [
  ...vertexSchemaUnsupportedFields,
  ...nonStandardSchemaFields,
];

/**
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output#fields
 */
const vertexSupportedFormatValues = ["date", "date-time", "duration", "time"];

const transformSchemaForGoogle = (schema: unknown): unknown => {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(transformSchemaForGoogle);
  }

  const result: Record<string, unknown> = {};
  for (const [uncheckedKey, value] of Object.entries(schema)) {
    const key = uncheckedKey === "oneOf" ? "anyOf" : uncheckedKey;

    if (key === "format" && typeof value === "string") {
      if (vertexSupportedFormatValues.includes(value)) {
        result[key] = value;
      } else {
        continue;
      }
    }

    if (key === "type" && typeof value === "string") {
      if (value === "null") {
        /**
         * Google doesn't support type: "null", instead it supports nullable: boolean;
         */
        throw new Error(
          "type: 'null' is not supported. This should have been addressed by schema transformation.",
        );
      } else {
        // Google wants the type to be uppercase for some reason
        result[key] = value.toUpperCase();
      }
    } else if (typeof value === "object") {
      if (
        "oneOf" in value &&
        (value as DereferencedPropertyType).oneOf.find((option) => {
          if ("type" in option) {
            return option.type === "null";
          }
          return false;
        })
      ) {
        /**
         * Google doesn't support type: "null", instead it supports nullable: boolean;
         * We need to transform any schema containing oneOf to add nullable: true to all its options.
         */
        const newOneOf = (value as DereferencedPropertyType).oneOf
          .filter((option) => "type" in option && option.type !== "null")
          .map((option: DereferencedPropertyType["oneOf"][number]) => ({
            ...option,
            nullable: true,
          }));

        if (newOneOf.length === 0) {
          /**
           * The Vertex AI schema requires that a schema has at least one type field,
           * but does not support 'null' as a type (instead you must pass nullable: true).
           * Therefore if someone happens to define a property type which ONLY accepts null,
           * there is no way to represent this in the Vertex AI schema.
           *
           * If we define a type it will incorrect be constrainted to '{type} | null'.
           */
          throw new Error(
            "Property type must have at least one option which is not null",
          );
        }

        (value as DereferencedPropertyType).oneOf =
          mustHaveAtLeastOne(newOneOf);
      }

      result[key] = transformSchemaForGoogle(value);
    } else if (fieldsToExclude.includes(key)) {
      if (typeof value === "object" && value !== null) {
        /**
         * If the value is an object, this might well be a property which happens to have the same simplified key
         * as one of our rejected fields.
         */
        if ("title" in value || "titlePlural" in value) {
          /**
           * This is the 'inverse' field, the only one of our excluded fields which has an object value.
           */
          continue;
        }
        result[key] = transformSchemaForGoogle(value);
      }
      /**
       * If the value is not an object, we have one of our fields which will be rejected,
       * not a schema.
       */
      continue;
    } else {
      result[key] = value;
    }
  }
  return result;
};

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

const getVertexAi = () => {
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

const storageBucket = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;

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
