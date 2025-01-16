import type { VersionedUrl } from "@blockprotocol/type-system";
import { Storage } from "@google-cloud/storage";
import type { Part, ResponseSchema } from "@google-cloud/vertexai";
import { SchemaType, VertexAI } from "@google-cloud/vertexai";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { EntityTypeRootType } from "@local/hash-subgraph";
import { getEntityTypes } from "@local/hash-subgraph/stdlib";
import dedent from "dedent";

import { logger } from "../../shared/activity-logger.js";
import {
  type DereferencedEntityType,
  dereferenceEntityType,
} from "../../shared/dereference-entity-type.js";
import { getFlowContext } from "../../shared/get-flow-context.js";
import { graphApiClient } from "../../shared/graph-api-client.js";

/**
 * Ideally we'd use something like Zod and zod-to-json-schema to define the schema, to have the type automatically
 * inferred, but the generated schema is not compatible with the Vertex AI schema, due to the latter's use of enums for
 * the type field.
 *
 * @todo use Zod and rewrite the bits of the schema that are incompatible with Vertex AI's schema type
 */
const documentMetadataSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
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
    doi: {
      description: "The DOI for this document, if provided",
      type: SchemaType.STRING,
    },
    doiLink: {
      description: "The DOI link for this document, if provided",
      type: SchemaType.STRING,
    },
    isbn: {
      description:
        "The ISBN for this document, if it is a book and the ISBN is provided",
      type: SchemaType.STRING,
    },
    publishedBy: {
      description: "The publisher of this document, if available.",
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING },
      },
    },
    publicationVenue: {
      description:
        "The venue in which this document/paper was published, if available",
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING },
      },
    },
    publishedInYear: {
      description:
        "The year (first year if a reprint) in which this document was published",
      type: SchemaType.INTEGER,
    },
    summary: {
      description: "A one paragraph summary of this document",
      type: SchemaType.STRING,
    },
    title: { description: "The document's title", type: SchemaType.STRING },
    type: {
      description:
        "If the specific type of this document is known, it can be provided here. Valid options are 'Book' and 'AcademicPaper'",
      format: "enum",
      enum: ["AcademicPaper", "Book"],
      type: SchemaType.STRING,
    },
  },
  required: ["summary", "title"],
};

const generateOutputSchema = (
  dereferencedDocEntityTypes: DereferencedEntityType[],
): ResponseSchema => {
  const rawSchema = {
    type: SchemaType.OBJECT,
    properties: {
      documentMetadata: {
        type: SchemaType.OBJECT,
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
    },
  };

  const transformSchemaForGoogle = (schema: unknown): unknown => {
    if (typeof schema !== "object" || schema === null) {
      return schema;
    }

    if (Array.isArray(schema)) {
      return schema.map(transformSchemaForGoogle);
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === "type" && typeof value === "string") {
        // Google wants the type to be uppercase for some reason
        result[key] = value.toUpperCase();
      } else if (typeof value === "object") {
        result[key] = transformSchemaForGoogle(value);
      } else if (
        key === "$id" ||
        (key === "abstract" && typeof value === "boolean")
      ) {
        /**
         * These fields will be rejected.
         *
         * abstract: boolean appears on data types.
         */
        continue;
      } else if (key === "oneOf") {
        result.anyOf = value;
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  return transformSchemaForGoogle(rawSchema) as ResponseSchema;
};

type DocumentMetadata = {
  documentMetadata: {
    entityTypeId: VersionedUrl;
  } & Record<string, unknown>;
};

type _DocumentMetadata = {
  authors?: { name: string; affiliatedWith?: string[] }[];
  doi?: string;
  doiLink?: string;
  isbn?: string;
  publishedBy?: {
    name: string;
  };
  publicationVenue?: {
    title: string;
  };
  publishedInYear?: number;
  summary: string;
  title: string;
  type?: "AcademicPaper" | "Book";
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
}: {
  hashFileStorageKey: string;
  fileSystemPath: string;
}): Promise<DocumentMetadata> => {
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
              { path: ["versionedUrl"] },
              { parameter: systemEntityTypes.doc.entityTypeId },
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
    .filter(
      (type) =>
        type.schema.$id === systemEntityTypes.doc.entityTypeId ||
        type.parentIds.includes(systemEntityTypes.doc.entityTypeId),
    )
    .map((type) => type.schema);

  const schema = generateOutputSchema(dereferencedDocEntityTypes);

  console.log(JSON.stringify(schema, null, 2));

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
    
    ${dereferencedDocEntityTypes.map((type) => `- ${type.title}`).join("\n")}

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

  console.log(JSON.stringify(resp, null, 2));

  if (!contentResponse) {
    throw new Error("No content response from LLM analysis");
  }

  const parsedResponse = JSON.parse(contentResponse) as DocumentMetadata;

  return parsedResponse;
};
