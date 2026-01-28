import type {
  BaseUrl,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  Property,
  PropertyObject,
  PropertyType,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { extractBaseUrl } from "@blockprotocol/type-system";
import type { Embedding } from "@local/hash-graph-client";
import OpenAI from "openai";

type Usage = OpenAI.CreateEmbeddingResponse.Usage;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const createEmbeddings = async (params: { input: string[] }) => {
  const response = await openai.embeddings.create({
    input: params.input,
    model: "text-embedding-3-large",
    encoding_format: "float",
  });

  return {
    usage: response.usage,
    embeddings: response.data.map((data) => data.embedding),
  };
};

const createPropertyEmbeddingInput = (params: {
  propertyTypeSchema: Pick<PropertyType, "title">;
  propertyValue: Property;
}): string => {
  return `${params.propertyTypeSchema.title}: ${
    typeof params.propertyValue === "string"
      ? params.propertyValue
      : JSON.stringify(params.propertyValue)
  }`;
};

/**
 * Creates embeddings for (a) each property and finally (b) a new line-separated list of all properties.
 *
 * @param params.excludedProperties - Property base URLs to exclude from embedding generation.
 *   Excluded properties will not have individual embeddings and will not be included in the
 *   combined embedding. Use this for sensitive properties that should not be searchable via
 *   semantic similarity (e.g., email on User entities to prevent enumeration attacks).
 */
export const createEntityEmbeddings = async (params: {
  entityProperties: PropertyObject;
  propertyTypes: { title: string; $id: VersionedUrl }[];
  excludedProperties?: BaseUrl[];
}): Promise<{
  embeddings: {
    /** If 'property' is absent, this is the combined embedding for all properties */
    property?: BaseUrl;
    embedding: number[];
  }[];
  usage: Usage;
}> => {
  // sort property types by their base url
  params.propertyTypes.sort((a, b) =>
    extractBaseUrl(a.$id).localeCompare(extractBaseUrl(b.$id)),
  );

  // We want to create embeddings for:
  //   1. Each individual '[Property Title]: [Value]' pair, and
  //   2. A list of all property key:value pairs
  //
  // We use the last item in the array to store the combined 'all properties' list.
  const propertyEmbeddings: string[] = [];
  const usedPropertyBaseUrls: BaseUrl[] = [];
  let combinedEntityEmbedding = "";
  for (const propertyType of params.propertyTypes) {
    const baseUrl = extractBaseUrl(propertyType.$id);

    // Skip excluded properties (e.g., email on User entities for security)
    if (params.excludedProperties?.includes(baseUrl)) {
      continue;
    }

    const property = params.entityProperties[baseUrl];

    if (property === undefined) {
      // `property` could be `null` or `false` as well but that is part of the semantic meaning of the property
      // and should be included in the embedding.
      continue;
    }

    const embeddingInput = createPropertyEmbeddingInput({
      propertyTypeSchema: propertyType,
      propertyValue: property,
    });

    combinedEntityEmbedding += `${embeddingInput}\n`;
    propertyEmbeddings.push(embeddingInput);
    usedPropertyBaseUrls.push(baseUrl);
  }

  if (usedPropertyBaseUrls.length === 0) {
    return {
      embeddings: [],
      usage: {
        prompt_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  const { embeddings, usage } = await createEmbeddings({
    input: [...propertyEmbeddings, combinedEntityEmbedding],
  });

  return {
    usage,
    embeddings: embeddings.map((embedding, idx) => ({
      property: usedPropertyBaseUrls[idx],
      embedding,
    })),
  };
};

export const createEntityTypeEmbeddings = async (params: {
  entityType: EntityTypeWithMetadata;
}): Promise<{
  embedding: Embedding;
  usage: Usage;
}> => {
  // We want to create embeddings for:
  //   1. The `Title: Description` pair
  const embeddingInputs: string[] = [
    `${params.entityType.schema.title}: ${params.entityType.schema.description}`,
  ];

  const { embeddings, usage } = await createEmbeddings({
    input: embeddingInputs,
  });
  if (embeddings.length !== 1) {
    throw new Error("Expected exactly one embedding");
  }

  return {
    usage,
    embedding: embeddings[0]!,
  };
};

export const createPropertyTypeEmbeddings = async (params: {
  propertyType: PropertyTypeWithMetadata;
}): Promise<{
  embedding: Embedding;
  usage: Usage;
}> => {
  // We want to create embeddings for:
  //   1. The `Title: Description` pair
  const embeddingInputs: string[] = [
    `${params.propertyType.schema.title}: ${params.propertyType.schema.description}`,
  ];

  const { embeddings, usage } = await createEmbeddings({
    input: embeddingInputs,
  });
  if (embeddings.length !== 1) {
    throw new Error("Expected exactly one embedding");
  }

  return {
    usage,
    embedding: embeddings[0]!,
  };
};

export const createDataTypeEmbeddings = async (params: {
  dataType: DataTypeWithMetadata;
}): Promise<{
  embedding: Embedding;
  usage: Usage;
}> => {
  // We want to create embeddings for:
  //   1. The `Title: Description` pair
  const embeddingInputs: string[] = [
    `${params.dataType.schema.title}: ${params.dataType.schema.description}`,
  ];

  const { embeddings, usage } = await createEmbeddings({
    input: embeddingInputs,
  });
  if (embeddings.length !== 1) {
    throw new Error("Expected exactly one embedding");
  }

  return {
    usage,
    embedding: embeddings[0]!,
  };
};
