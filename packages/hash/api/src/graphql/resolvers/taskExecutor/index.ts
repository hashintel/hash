import { ApolloError } from "apollo-server-express";
import { JSONObject } from "blockprotocol";
import { upperFirst, camelCase } from "lodash";
import { singular } from "pluralize";
import { Entity } from "../../../model";
import { CachedEntityTypes, Task } from "../../../task-execution";
import {
  MutationExecuteGithubCheckTaskArgs,
  MutationExecuteGithubDiscoverTaskArgs,
  MutationExecuteGithubReadTaskArgs,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";

export const executeDemoTask: Resolver<
  Promise<string>,
  {},
  GraphQLContext
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

export const executeGithubSpecTask: Resolver<
  Promise<string>,
  {},
  GraphQLContext
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

export const executeGithubCheckTask: Resolver<
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
  json_schema?: JSONObject;
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

const streamNameToEntityTypeName = (name: string) => {
  const sanitizedName = singular(upperFirst(camelCase(name)));
  return `Github${sanitizedName}`;
};

export const executeGithubDiscoverTask: Resolver<
  Promise<string>,
  {},
  LoggedInGraphQLContext,
  MutationExecuteGithubDiscoverTaskArgs
> = async (
  _,
  { config },
  { dataSources: { db, taskExecutor }, user, logger },
) => {
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

      const existingEntityChecker = await CachedEntityTypes(db, user);

      for (const message of catalog) {
        if (!message.name || !message.json_schema) {
          continue;
        }

        const entityTypeName = streamNameToEntityTypeName(message.name);

        if (existingEntityChecker.getExisting(entityTypeName) === undefined) {
          await existingEntityChecker.createNew(
            entityTypeName,
            message.json_schema,
          );
          logger.debug(`Created a new EntityType: ${entityTypeName}`);
        }
      }

      return JSON.stringify(catalog);
    } catch (err: any) {
      throw new ApolloError(`Task-execution failed: ${err}`);
    }
  }
};

export const executeGithubReadTask: Resolver<
  Promise<string>,
  {},
  LoggedInGraphQLContext,
  MutationExecuteGithubReadTaskArgs
> = async (
  _,
  { config },
  { dataSources: { db, taskExecutor }, user, logger },
) => {
  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  } else {
    const createdEntities = [];
    try {
      const airbyteRecords: AirbyteRecords = await taskExecutor.runTask(
        Task.GithubRead,
        config,
      );
      logger.debug(`Received ${airbyteRecords.length} records from Github`);

      const existingEntityChecker = await CachedEntityTypes(db, user);
      for (const record of airbyteRecords) {
        const entityTypeName = streamNameToEntityTypeName(record.stream);
        /** @todo - Check if entity already exists */
        const entityTypeId = existingEntityChecker.getExisting(entityTypeName);
        if (!entityTypeId) {
          throw new Error(
            `Couldn't find EntityType for ingested data with name: ${entityTypeName}`,
          );
        }

        /** @todo - check primary key to see if entity already exists */
        // Insert the entity
        const entity = await Entity.create(db, {
          accountId: user.accountId,
          createdByAccountId: user.accountId,
          versioned: true,
          entityTypeId,
          properties: record.data,
        });

        createdEntities.push(entity.entityId);
      }

      logger.debug(`Inserted ${createdEntities.length} entities from Github`);
      return JSON.stringify({ createdEntities });
    } catch (err: any) {
      throw new ApolloError(`Task-execution failed: ${err}`);
    }
  }
};
