import { DataSource } from "apollo-datasource";
import fetch from "node-fetch";
import { EntityType } from "@blockprotocol/type-system";
import { EntityTypeModel, UserModel } from "../model";
import { GraphApi } from "../graph";

/** @todo: When task scheduling is more mature and we move away from the temporary `hash-task-executor` we should have a single source of */
//  truth for available tasks, likely importable.
export enum Task {
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
    runTask: async (route: Task, body?: any) => {
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
 * Provides ways to look up entityTypeIds by name, and to create new ones.
 *
 * @param graphApi - The Graph API client to use for queries
 * @param user - The User that's making the query
 * @returns an object with a getExisting, and a createNew, method
 *
 * @todo - This is temporary and should be removed when we extend the EntityType model class to support these actions properly
 */
export const CachedEntityTypes = async (
  graphApi: GraphApi,
  user: UserModel,
) => {
  const streamsWithEntityTypes: Map<string, EntityTypeModel> = new Map();
  const entityTypes = await EntityTypeModel.getAllLatest(graphApi);

  return {
    getExisting: (entityTypeTitle: string) => {
      // check the map to find the entityTypeId associated with the stream if we've already encountered it
      let entityTypeModel = streamsWithEntityTypes.get(entityTypeTitle);

      if (entityTypeModel === undefined) {
        // check all entityTypes to see if there's one with the same name as the stream
        entityTypeModel = entityTypes.find(
          (entityType) => entityType.getSchema().title === entityTypeTitle,
        );
      }
      return entityTypeModel;
    },

    createNew: async (entityTypeTitle: string, jsonSchema: EntityType) => {
      const entityTypeModel = await EntityTypeModel.create(graphApi, {
        ownedById: user.getEntityUuid(),
        actorId: user.getEntityUuid(),
        schema: { ...jsonSchema, title: entityTypeTitle },
      });

      streamsWithEntityTypes.set(entityTypeTitle, entityTypeModel);
    },
  };
};
