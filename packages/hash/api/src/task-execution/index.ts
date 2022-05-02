import { DataSource } from "apollo-datasource";
import { JSONObject } from "blockprotocol";
import fetch from "node-fetch";
import { DbAdapter } from "../db";
import { EntityType, User } from "../model";

/** @todo: When task scheduling is more mature and we move away from the temporary `hash-task-executor` we should have a single source of */
//  truth for available tasks, likely importable.
export enum Tasks {
  Demo = "python",
  GithubSpec = "github/spec",
  GithubCheck = "github/check",
  GithubDiscover = "github/discover",
  GithubRead = "github/read",
}

export type Config = {
  host: string;
  port: number;
};

export type TaskExecutor = ReturnType<typeof connectToTaskExecutor> &
  DataSource;

/**
 * @param config The connection config for connecting to the Task-Executor
 * @returns a connection object with a runTask method
 *
 * Note: a pretty dumb method at the moment, but provides a clean boundary where we can slot in logic for a more complex task-execution mechanism later on
 */
export const connectToTaskExecutor = (config: Config) => {
  return {
    runTask: async (route: Tasks, body?: any) => {
      const resp = await fetch(
        `http://${config.host}:${config.port}/${route}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      if (resp.ok) {
        return resp.json();
      } else {
        throw new Error(
          `Task Execution failed for ${route}: ${await resp.text()}`,
        );
      }
    },
  };
};

/**
 * Provides ways to look up EntityIds by name, and to create new ones.
 *
 * @param db - The DB Adapter to use for queries
 * @param user - The User that's making the query
 * @returns an object with a getExisting, and a createNew, method
 *
 * @todo - This is temporary and should be removed when we extend the EntityId type to support these actions properly
 */
export const CachedEntityTypes = async (db: DbAdapter, user: User) => {
  const streamsWithEntityTypes: Map<string, string> = new Map();
  const dbTypes = await db.getAccountEntityTypes({
    accountId: user.accountId,
  });

  return {
    getExisting: (entityTypeName: string) => {
      // check the map to find the entityTypeId associated with the stream if we've already encountered it
      let entityTypeId: string | undefined =
        streamsWithEntityTypes.get(entityTypeName);

      if (entityTypeId === undefined) {
        // check all entityTypes to see if there's one with the same name as the stream
        entityTypeId = dbTypes.find(
          (entityType) => entityType.metadata.name === entityTypeName,
        )?.entityId; /** @todo - entityId does not make sense here, https://app.asana.com/0/1200211978612931/1200809642643269/f */
      }
      return entityTypeId;
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
