import { JsonObject } from "@blockprotocol/core";
import {
  EntityType,
  PropertyType,
  VersionedUri,
} from "@blockprotocol/type-system";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { OwnedById } from "@hashintel/hash-shared/types";
import { typedEntries, typedKeys } from "@hashintel/hash-shared/util";
import { PropertyObject } from "@hashintel/hash-subgraph";
import { ApolloError } from "apollo-server-express";

import { createEntity } from "../../../graph/knowledge/primitive/entity";
import { User } from "../../../graph/knowledge/system-types/user";
import { Task, TaskExecutor } from "../../../task-execution";
import {
  createEntityTypeTree,
  rewriteEntityPropertiesInTypeSystem,
} from "./generation";

type AirbyteRecords = Array<{
  /**
   * the name of this record's stream
   */
  stream: string;
  /**
   * the record data
   */
  data: {
    [k: string]: unknown;
  };
  /**
   * when the data was emitted from the source. epoch in millisecond.
   */
  emitted_at: number;
  /**
   * the namespace of this record's stream
   */
  namespace?: string;
  [k: string]: unknown;
}>;

export const readFromAirbyte = async ({
  task,
  user,
  taskExecutor,
  logger,
  graphApi,
  config,
  integrationName,
}: {
  task: Task;
  user: User;
  taskExecutor: TaskExecutor;
  logger: Logger;
  graphApi: GraphApi;
  config: any;
  integrationName: string;
}) => {
  if (!user.shortname) {
    throw new ApolloError(
      "User must have completed the sign-up process and have a shortname",
    );
  }

  const airbyteRecords: AirbyteRecords = await taskExecutor.runTask(
    task,
    config,
  );
  logger.debug(
    `Received ${airbyteRecords.length} records from ${integrationName}. Traversing and rewriting into the type system.`,
  );

  const streamToKeyToPropertyTypes: Record<
    string,
    Record<string, PropertyType>
  > = {};
  const streamToEntityTypes: Record<string, EntityType> = {};
  const entityTypeIdToEntityProperties: Record<VersionedUri, PropertyObject[]> =
    {};

  for (const record of airbyteRecords) {
    const streamName = record.stream;

    const streamKeyMap = streamToKeyToPropertyTypes[streamName] ?? {};
    const entityType = streamToEntityTypes[streamName];
    const entityProperties = record.data;

    const {
      entityProperties: updatedEntityProperties,
      entityType: updatedEntityType,
    } = rewriteEntityPropertiesInTypeSystem(
      entityProperties as JsonObject,
      streamKeyMap,
      entityType,
      streamName,
      integrationName,
      user.shortname,
    );

    if (entityTypeIdToEntityProperties[updatedEntityType.$id] !== undefined) {
      entityTypeIdToEntityProperties[updatedEntityType.$id]!.push(
        updatedEntityProperties,
      );
    } else {
      entityTypeIdToEntityProperties[updatedEntityType.$id] = [
        updatedEntityProperties,
      ];
    }

    streamToKeyToPropertyTypes[streamName] = streamKeyMap;
    streamToEntityTypes[streamName] = updatedEntityType;
  }

  logger.debug(
    "Finished rewriting data into entities and types, inserting into the Graph.",
  );

  const propertyTypeMap: Record<
    VersionedUri,
    { schema: PropertyType; created: boolean }
  > = Object.fromEntries(
    Object.values(streamToKeyToPropertyTypes)
      .flatMap((keyMaps) => Object.values(keyMaps))
      .map((propertyType) => [
        propertyType.$id,
        { schema: propertyType, created: false },
      ]),
  );
  const entityTypeMap: Record<
    VersionedUri,
    { schema: EntityType; created: boolean }
  > = Object.fromEntries(
    Object.values(streamToEntityTypes).map((entityType) => [
      entityType.$id,
      { schema: entityType, created: false },
    ]),
  );

  const createdEntityTypes = [];
  const createdPropertyTypes = [];
  const createdEntities = [];

  /** @todo - Check if entity type already exists */
  for (const entityTypeId of typedKeys(entityTypeMap)) {
    const {
      createdPropertyTypes: newCreatedPropertyTypes,
      createdEntityTypes: newCreatedEntityTypes,
    } = await createEntityTypeTree(
      graphApi,
      entityTypeId,
      entityTypeMap,
      propertyTypeMap,
      user,
    );

    createdPropertyTypes.push(...newCreatedPropertyTypes);
    createdEntityTypes.push(...newCreatedEntityTypes);
  }

  logger.debug(
    `Inserted ${createdPropertyTypes.length} property types from ${integrationName}`,
  );
  logger.debug(
    `Inserted ${createdEntityTypes.length} entity types from ${integrationName}`,
  );

  /** @todo - check primary key to see if entity already exists */
  for (const [entityTypeId, entityPropertiesList] of typedEntries(
    entityTypeIdToEntityProperties,
  )) {
    for (const entityProperties of entityPropertiesList) {
      createdEntities.push(
        await createEntity(
          { graphApi },
          {
            ownedById: user.accountId as OwnedById,
            actorId: user.accountId,
            entityTypeId,
            properties: entityProperties,
          },
        ),
      );
    }
  }

  logger.debug(
    `Inserted ${createdEntities.length} entities from ${integrationName}`,
  );
  return JSON.stringify({
    createdPropertyTypes,
    createdEntityTypes,
    createdEntities,
  });
};
