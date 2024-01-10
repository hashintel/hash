import type {
  BaseUrl,
  EntityPropertiesObject,
  EntityPropertyValue,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import OpenAI from "openai/index";
import { CreateEmbeddingResponse } from "openai/resources";
import Usage = CreateEmbeddingResponse.Usage;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const createEmbeddingInput = (params: {
  propertyType: PropertyTypeWithMetadata;
  property: EntityPropertyValue;
}): string => {
  return `${params.propertyType.schema.title}: ${JSON.stringify(
    params.property,
  )}`;
};

export const createEmbeddings = async (params: {
  entityProperties: EntityPropertiesObject;
  propertyTypes: PropertyTypeWithMetadata[];
}): Promise<{
  embeddings: { property?: BaseUrl; embedding: number[] }[];
  usage: Usage;
}> => {
  if (params.propertyTypes.length === 0) {
    return {
      embeddings: [],
      usage: {
        prompt_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  // sort property types by their base url
  params.propertyTypes.sort((a, b) =>
    a.metadata.recordId.baseUrl.localeCompare(b.metadata.recordId.baseUrl),
  );

  // We want to create embeddings for:
  //   1. Each individual '[Property Title]: [Value]' pair, and
  //   2. A list of all property key:value pairs
  //
  // We use the last item in the array to store the combined 'all properties' list.
  const propertyEmbeddings = [];
  let combinedEntityEmbedding = "";
  for (const propertyType of params.propertyTypes) {
    const property =
      params.entityProperties[propertyType.metadata.recordId.baseUrl];
    if (property === undefined) {
      // `property` could be `null` or `false` as well but that is part of the semantic meaning of the property
      // and should be included in the embedding.
      continue;
    }
    const embeddingInput = createEmbeddingInput({ propertyType, property });
    combinedEntityEmbedding += `${embeddingInput}\n`;
    propertyEmbeddings.push(embeddingInput);
  }

  const response = await openai.embeddings.create({
    input: [...propertyEmbeddings, combinedEntityEmbedding],
    model: "text-embedding-ada-002",
  });

  return {
    usage: response.usage,
    embeddings: response.data.map((data, idx) => ({
      property: params.propertyTypes[idx]?.metadata.recordId.baseUrl,
      embedding: data.embedding,
    })),
  };
};
