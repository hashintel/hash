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

  const input = [""];
  for (const propertyType of params.propertyTypes) {
    const property =
      params.entityProperties[propertyType.metadata.recordId.baseUrl];
    if (property === undefined) {
      // `property` could be `null` or `false` as well but that is part of the semantic meaning of the property
      // and should be included in the embedding.
      continue;
    }
    const embeddingInput = createEmbeddingInput({ propertyType, property });
    input[0] += `${embeddingInput}\n`;
    input.push(embeddingInput);
  }

  const response = await openai.embeddings.create({
    input,
    model: "text-embedding-ada-002",
  });

  return {
    usage: response.usage,
    embeddings: response.data.map((data, idx) => ({
      property:
        idx > 0
          ? params.propertyTypes[idx - 1]!.metadata.recordId.baseUrl
          : undefined,
      embedding: data.embedding,
    })),
  };
};
