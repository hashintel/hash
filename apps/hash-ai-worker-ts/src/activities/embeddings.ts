import type {
  BaseUrl,
  EntityPropertiesObject,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import OpenAI from "openai/index";
import { CreateEmbeddingResponse } from "openai/resources";

import { createPropertyEmbeddingInput } from "./shared/create-embedding-input";
import Usage = CreateEmbeddingResponse.Usage;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const createEmbeddings = async (params: { input: string[] }) => {
  const response = await openai.embeddings.create({
    input: params.input,
    model: "text-embedding-ada-002",
  });

  return {
    usage: response.usage,
    embeddings: response.data.map((data) => data.embedding),
  };
};

export const createEntityEmbeddings = async (params: {
  entityProperties: EntityPropertiesObject;
  propertyTypes: PropertyTypeWithMetadata[];
}): Promise<{
  embeddings: { property?: BaseUrl; embedding: number[] }[];
  usage: Usage;
}> => {
  // sort property types by their base url
  params.propertyTypes.sort((a, b) =>
    a.metadata.recordId.baseUrl.localeCompare(b.metadata.recordId.baseUrl),
  );

  // We want to create embeddings for:
  //   1. Each individual '[Property Title]: [Value]' pair, and
  //   2. A list of all property key:value pairs
  //
  // We use the last item in the array to store the combined 'all properties' list.
  const propertyEmbeddings: string[] = [];
  const usedPropertyTypes: PropertyTypeWithMetadata[] = [];
  let combinedEntityEmbedding = "";
  for (const propertyType of params.propertyTypes) {
    const property =
      params.entityProperties[propertyType.metadata.recordId.baseUrl];
    if (property === undefined) {
      // `property` could be `null` or `false` as well but that is part of the semantic meaning of the property
      // and should be included in the embedding.
      continue;
    }
    const embeddingInput = createPropertyEmbeddingInput({
      propertyTypeSchema: propertyType.schema,
      propertyValue: property,
    });
    combinedEntityEmbedding += `${embeddingInput}\n`;
    propertyEmbeddings.push(embeddingInput);
    usedPropertyTypes.push(propertyType);
  }

  if (usedPropertyTypes.length === 0) {
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
      property: usedPropertyTypes[idx]?.metadata.recordId.baseUrl,
      embedding,
    })),
  };
};
