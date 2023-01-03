import { JsonObject } from "@blockprotocol/core";
import {
  EntityType,
  PropertyType,
  VersionedUri,
} from "@blockprotocol/type-system";
import { OwnedById } from "@hashintel/hash-shared/types";
import { typedEntries, typedKeys } from "@hashintel/hash-shared/util";
import { PropertyObject } from "@hashintel/hash-subgraph";
import { ApolloError } from "apollo-server-express";

import { createEntity } from "../../../graph/knowledge/primitive/entity";
import { Task } from "../../../task-execution";
import {
  MutationExecuteGithubCheckTaskArgs,
  MutationExecuteGithubDiscoverTaskArgs,
  MutationExecuteGithubReadTaskArgs,
  ResolverFn,
} from "../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import {
  createEntityTypeTree,
  rewriteEntityPropertiesInTypeSystem,
} from "./generation";

export const executeDemoTask: ResolverFn<
  Promise<string>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources: { taskExecutor } }) => {
  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  } else {
    return await taskExecutor
      .runTask(Task.Demo)
      .then((res) => res.toString())
      .catch((err) => {
        throw new ApolloError(`Task-execution failed: ${err}`);
      });
  }
};

export const executeGithubSpecTask: ResolverFn<
  Promise<string>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources: { taskExecutor } }) => {
  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  } else {
    return await taskExecutor
      .runTask(Task.GithubSpec)
      .then((res) => JSON.stringify(res))
      .catch((err: any) => {
        throw new ApolloError(`Task-execution failed: ${err}`);
      });
  }
};

export const executeGithubCheckTask: ResolverFn<
  Promise<string>,
  {},
  GraphQLContext,
  MutationExecuteGithubCheckTaskArgs
> = async (_, { config }, { dataSources: { taskExecutor } }) => {
  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  } else {
    return await taskExecutor
      .runTask(Task.GithubCheck, config)
      .then((res) => JSON.stringify(res))
      .catch((err) => {
        throw new ApolloError(`Task-execution failed: ${err}`);
      });
  }
};

/** @todo - Make Airbyte types available in api package */
type AirbyteCatalog = Array<{
  name?: string;
  json_schema?: JsonObject;
}>;

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

export const executeGithubDiscoverTask: ResolverFn<
  Promise<string>,
  {},
  LoggedInGraphQLContext,
  MutationExecuteGithubDiscoverTaskArgs
> = async (_, { config }, { dataSources: { taskExecutor } }) => {
  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  } else {
    try {
      const catalog: AirbyteCatalog = await taskExecutor.runTask(
        Task.GithubDiscover,
        config,
      );

      return JSON.stringify(catalog);
    } catch (err: any) {
      throw new ApolloError(`Task-execution failed: ${err}`);
    }
  }
};

export const executeGithubReadTask: ResolverFn<
  Promise<string>,
  {},
  LoggedInGraphQLContext,
  MutationExecuteGithubReadTaskArgs
> = async (
  _,
  { config },
  { dataSources: { graphApi, taskExecutor }, user, logger },
) => {
  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  }

  if (!user.shortname) {
    throw new ApolloError(
      "User must have completed the sign-up process and have a shortname",
    );
  }

  try {
    const airbyteRecords: AirbyteRecords = await taskExecutor.runTask(
      Task.GithubRead,
      config,
    );
    logger.debug(
      `Received ${airbyteRecords.length} records from Github. Traversing and rewriting into the type system.`,
    );

    const streamToKeyToPropertyTypes: Record<
      string,
      Record<string, PropertyType>
    > = {};
    const streamToEntityTypes: Record<string, EntityType> = {};
    const entityTypeIdToEntityProperties: Record<
      VersionedUri,
      PropertyObject[]
    > = {};

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
        "Github",
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
      `Inserted ${createdPropertyTypes.length} property types from Asana`,
    );
    logger.debug(
      `Inserted ${createdEntityTypes.length} entity types from Asana`,
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

    logger.debug(`Inserted ${createdEntities.length} entities from Asana`);
    return JSON.stringify({
      createdPropertyTypes,
      createdEntityTypes,
      createdEntities,
    });
  } catch (err: any) {
    throw new ApolloError(`Task-execution failed: ${err}`);
  }
};
