import { ApolloError } from "apollo-server-express";
import { JSONObject } from "blockprotocol";
import { DbAdapter } from "../../../db";
import { Entity, EntityType, User } from "../../../model";
import { Tasks } from "../../../task-execution";
import { Resolver } from "../../apiTypes.gen";
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
    try {
      return await taskExecutor
        .run_task(Tasks.Demo)
        .then((res) => res.toString());
    } catch (err: any) {
      throw new ApolloError(`Task-execution failed: ${err}`);
    }
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
    try {
      return await taskExecutor
        .run_task(Tasks.GithubSpec)
        .then((res) => JSON.stringify(res));
    } catch (err: any) {
      throw new ApolloError(`Task-execution failed: ${err}`);
    }
  }
};

export const executeGithubCheckTask: Resolver<
  Promise<string>,
  {},
  GraphQLContext
> = async (_, __, { dataSources: { taskExecutor } }) => {
  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  } else {
    try {
      return await taskExecutor
        .run_task(Tasks.GithubCheck)
        .then((res) => JSON.stringify(res));
    } catch (err: any) {
      throw new ApolloError(`Task-execution failed: ${err}`);
    }
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

const ExistingEntityChecker = async (db: DbAdapter, user: User) => {
  const streamsWithEntityTypes: Map<string, string> = new Map();
  const dbTypes = await db.getAccountEntityTypes({
    accountId: user.accountId,
  });

  return {
    getExisting: (entityTypeName: string) => {
      // check the map to find the entityTypeId associated with the stream if we've already encountered it
      let entityTypeId: string | undefined | null =
        streamsWithEntityTypes.get(entityTypeName);

      if (entityTypeId === undefined) {
        // check all entityTypes to see if there's one with the same name as the stream
        entityTypeId = dbTypes.find(
          (entityType) => entityType.metadata.name === entityTypeName,
        )?.entityId; /** @todo - WHY is this entityId instead of entityTypeId?! */
      }
      return entityTypeId || undefined;
    },

    createNew: async (entityTypeName: string, jsonSchema?: JSONObject) => {
      const entityTypeId = await db.transaction(async (client) => {
        const entityType = await EntityType.create(client, {
          /** @todo should this be a param on the graphql endpoint */
          accountId: user.accountId,
          createdByAccountId: user.accountId,
          description: undefined,
          name: entityTypeName,
          schema: jsonSchema,
        });
        return entityType.entityId;
      });

      streamsWithEntityTypes.set(entityTypeName, entityTypeId);
    },
  };
};

const streamNameToEntityTypeName = (name: string) => {
  return `Github${name.charAt(0).toUpperCase() + name.slice(1)}`;
};

export const executeGithubDiscoverTask: Resolver<
  Promise<string>,
  {},
  LoggedInGraphQLContext
> = async (_, __, { dataSources: { db, taskExecutor }, user }) => {
  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  } else {
    try {
      const catalog: AirbyteCatalog = await taskExecutor.run_task(
        Tasks.GithubDiscover,
      );

      const existingEntityChecker = await ExistingEntityChecker(db, user);

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
  LoggedInGraphQLContext
> = async (_, __, { dataSources: { db, taskExecutor }, user }) => {
  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  } else {
    const createdEntities = [];
    try {
      const airbyteRecords: AirbyteRecords = await taskExecutor.run_task(
        Tasks.GithubRead,
      );
      const existingEntityChecker = await ExistingEntityChecker(db, user);
      for (const record of airbyteRecords) {
        const entityTypeName = streamNameToEntityTypeName(record.stream);
        /** @todo - Check if entity already exists */
        const entityTypeId = existingEntityChecker.getExisting(entityTypeName);
        if (!entityTypeId) {
          throw new Error(
            `Couldn't find EntityType for ingested data with name: ${entityTypeName}`,
          );
        }
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

      return JSON.stringify({ createdEntities });
    } catch (err: any) {
      throw new ApolloError(`Task-execution failed: ${err}`);
    }
  }
};
