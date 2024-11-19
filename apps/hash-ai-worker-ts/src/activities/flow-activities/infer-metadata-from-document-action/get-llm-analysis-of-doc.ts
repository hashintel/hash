import { Storage } from "@google-cloud/storage";
import type {
  GenerativeModel,
  Part,
  ResponseSchema,
} from "@google-cloud/vertexai";
import { SchemaType, VertexAI } from "@google-cloud/vertexai";

import { logger } from "../../shared/activity-logger.js";

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

export type DocumentMetadata = {
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

const googleCloudProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

let _generativeModel: GenerativeModel | undefined;

const getGeminiModel = () => {
  if (!googleCloudProjectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT_ID environment variable is not set");
  }

  if (_generativeModel) {
    return _generativeModel;
  }

  const vertexAI = new VertexAI({
    project: googleCloudProjectId,
    location: "us-east4",
  });

  const generativeModel = vertexAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: documentMetadataSchema,
    },
  });

  _generativeModel = generativeModel;

  return generativeModel;
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

  const gemini = getGeminiModel();

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
    text: `Please provide a summary of this document, and any of the requested metadata you can infer from it.
    If you're not confident about any of the metadata fields, omit them.`,
  };

  const request = {
    contents: [{ role: "user", parts: [filePart, textPart] }],
  };

  const resp = await gemini.generateContent(request);

  const contentResponse = resp.response.candidates?.[0]?.content.parts[0]?.text;

  if (!contentResponse) {
    throw new Error("No content response from LLM analysis");
  }

  const parsedResponse = JSON.parse(contentResponse) as DocumentMetadata;

  return parsedResponse;
};
