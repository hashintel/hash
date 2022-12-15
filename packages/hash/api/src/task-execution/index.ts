import { DataSource } from "apollo-datasource";
import fetch from "node-fetch";
import { EntityType } from "@blockprotocol/type-system";
import { EntityTypeWithMetadata } from "@hashintel/hash-subgraph";
import { brand } from "@hashintel/hash-shared/types";

import { UserModel } from "../model";
import { GraphApi } from "../graph";
import { createEntityType } from "../graph/ontology/primitive/entity-type";

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
  const streamsWithEntityTypes: Map<string, EntityTypeWithMetadata> = new Map();
  const { data: entityTypes } = await graphApi.getLatestEntityTypes();

  return {
    getExisting: (entityTypeTitle: string) => {
      // check the map to find the entityTypeId associated with the stream if we've already encountered it
      const entityType = streamsWithEntityTypes.get(entityTypeTitle);

      if (entityType === undefined) {
        // check all entityTypes to see if there's one with the same name as the stream
        return entityTypes.find(
          ({ schema }) => schema.title === entityTypeTitle,
        );
      }

      return entityType;
    },

    createNew: async (entityTypeTitle: string, jsonSchema: EntityType) => {
      const entityType = await createEntityType(
        { graphApi },
        {
          ownedById: brand(user.getEntityUuid()),
          actorId: brand(user.getEntityUuid()),
          schema: { ...jsonSchema, title: entityTypeTitle },
        },
      );

      streamsWithEntityTypes.set(entityTypeTitle, entityType);
    },
  };
};
