import { getRequiredEnv } from "./environment";
import { Logger } from "./logger";
import { Entity, EntityType, PropertyType } from "./pg-tables";
import { RedisConfig, setupRedisClient } from "./redis";
import { RedisStreamConsumer, RedisStreamProducer } from "./stream/redis";

/**
 * @todo Consider adding realtime handling for types
 *   https://app.asana.com/0/0/1202922776289399/f
 */
const supportedTables = {
  entityTables: ["entity_editions", "entity_temporal_metadata"],
  entityTypeTables: ["entity_types"],
  propertyTypeTables: ["property_types"],
} as const;

export const supportedRealtimeTables: SupportedRealtimeTable[] =
  Object.values(supportedTables).flat();

export type SupportedRealtimeTable =
  (typeof supportedTables)[keyof typeof supportedTables][number];

export type SupportedRealtimeEntityTable =
  (typeof supportedTables)["entityTables"][number];

export const isSupportedRealtimeEntityTable = (
  table: string,
): table is SupportedRealtimeEntityTable =>
  supportedTables.entityTables.includes(table as SupportedRealtimeEntityTable);

export type SupportedRealtimeEntityTypeTable =
  (typeof supportedTables)["entityTypeTables"][number];

export const isSupportedRealtimeEntityTypeTable = (
  table: string,
): table is SupportedRealtimeEntityTable =>
  supportedTables.entityTypeTables.includes(
    table as SupportedRealtimeEntityTypeTable,
  );

export type SupportedRealtimePropertyTypeTable =
  (typeof supportedTables)["propertyTypeTables"][number];

export const isSupportedRealtimePropertyTypeTable = (
  table: string,
): table is SupportedRealtimePropertyTypeTable =>
  supportedTables.propertyTypeTables.includes(
    table as SupportedRealtimePropertyTypeTable,
  );

const getStreams = () => {
  return {
    entityStream: getRequiredEnv("HASH_REALTIME_ENTITY_STREAM_NAME"),
    entityTypeStream: getRequiredEnv("HASH_REALTIME_ENTITY_TYPE_STREAM_NAME"),
    propertyTypeStream: getRequiredEnv(
      "HASH_REALTIME_PROPERTY_TYPE_STREAM_NAME",
    ),
  };
};

// The realtime service will push all updates from the Postgres changestream to the
// following queues.
export const generateStreamProducers = (
  logger: Logger,
  redisConfig: RedisConfig,
) => {
  const streams = getStreams();
  return {
    entityStream: new RedisStreamProducer<Entity>(
      logger,
      setupRedisClient(logger, redisConfig),
      streams.entityStream,
    ),
    entityTypeStream: new RedisStreamProducer<EntityType>(
      logger,
      setupRedisClient(logger, redisConfig),
      streams.entityTypeStream,
    ),
    propertyTypeStream: new RedisStreamProducer<PropertyType>(
      logger,
      setupRedisClient(logger, redisConfig),
      streams.propertyTypeStream,
    ),
  } as const;
};

export const generateStreamConsumers = (
  logger: Logger,
  redisConfig: RedisConfig,
) => {
  const streams = getStreams();
  return {
    entityStream: new RedisStreamConsumer<Entity>(
      logger,
      setupRedisClient(logger, redisConfig),
      streams.entityStream,
    ),
    entityTypeStream: new RedisStreamConsumer<EntityType>(
      logger,
      setupRedisClient(logger, redisConfig),
      streams.entityTypeStream,
    ),
    propertyTypeStream: new RedisStreamConsumer<PropertyType>(
      logger,
      setupRedisClient(logger, redisConfig),
      streams.propertyTypeStream,
    ),
  } as const;
};
