import { EntityType } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  PgEntity,
  PgEntityType,
  PgPropertyType,
} from "@local/hash-backend-utils/pg-tables";
import { RedisStreamConsumer } from "@local/hash-backend-utils/stream/redis";
import dedent from "dedent";
import { OpenAIApi } from "openai";

import { VectorDbIndexName } from "./config";
import { VectorDb } from "./vector/vector";

export type HandlerParameters = {
  logger: Logger;
  openai: OpenAIApi;
  vectorDb: VectorDb;
};

export const handleEntityChange = (
  params: HandlerParameters & {
    consumer: RedisStreamConsumer<PgEntity>;
  },
) => {
  const stringify = (entity: PgEntity) => {
    return dedent`
An entity instance with the ID: ${entity.owned_by_id}%${entity.entity_uuid} at decision time ${entity.decision_time}

has the following properties:
${entity.properties}
`;
  };

  const { logger, consumer, openai, vectorDb } = params;

  return consumer.handleEvery(async (entity: PgEntity) => {
    const contents = stringify(entity);
    const embedding = await openai.createEmbedding({
      input: contents,
      model: "text-embedding-ada-002",
    });
    await vectorDb.indexVectors("entities" satisfies VectorDbIndexName, [
      {
        id: entity.entity_uuid,
        payload: { contents, metadata: entity },
        vector: embedding.data.data[0]!.embedding,
      },
    ]);
    logger.info(`Indexed entity: ${entity.entity_uuid}`);
  });
};

export const handleEntityTypeChange = (
  params: HandlerParameters & {
    consumer: RedisStreamConsumer<PgEntityType>;
  },
) => {
  const stringify = (entityType: PgEntityType) => {
    const schema = JSON.parse(entityType.schema) as EntityType;
    return dedent`
An entity type with the $id: ${schema.$id}

has the following schema:
${entityType}
`;
  };

  const { logger, consumer, openai, vectorDb } = params;

  return consumer.handleEvery(async (entityType: PgEntityType) => {
    const contents = stringify(entityType);
    const embedding = await openai.createEmbedding({
      input: contents,
      model: "text-embedding-ada-002",
    });
    await vectorDb.indexVectors("entity_types" satisfies VectorDbIndexName, [
      {
        id: entityType.ontology_id,
        payload: { contents, metadata: entityType },
        vector: embedding.data.data[0]!.embedding,
      },
    ]);
    logger.info(`Indexed entity type: ${entityType.ontology_id}`);
  });
};

export const handlePropertyTypeChange = (
  params: HandlerParameters & {
    consumer: RedisStreamConsumer<PgPropertyType>;
  },
) => {
  const stringify = (propertyType: PgPropertyType) => {
    const schema = JSON.parse(propertyType.schema) as EntityType;
    return dedent`
An property type with the $id: ${schema.$id}

has the following schema:
${propertyType}
`;
  };

  const { logger, consumer, openai, vectorDb } = params;

  return consumer.handleEvery(async (propertyType: PgPropertyType) => {
    const contents = stringify(propertyType);
    const embedding = await openai.createEmbedding({
      input: contents,
      model: "text-embedding-ada-002",
    });
    await vectorDb.indexVectors("property_types" satisfies VectorDbIndexName, [
      {
        id: propertyType.ontology_id,
        payload: { contents, metadata: propertyType },
        vector: embedding.data.data[0]!.embedding,
      },
    ]);
    logger.info(`Indexed property type: ${propertyType.ontology_id}`);
  });
};
