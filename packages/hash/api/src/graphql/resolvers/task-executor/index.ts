import { JsonObject } from "@blockprotocol/core";
import { ApolloError } from "apollo-server-express";

import { Task } from "../../../task-execution";
import {
  MutationExecuteAsanaCheckTaskArgs,
  MutationExecuteAsanaDiscoverTaskArgs,
  MutationExecuteAsanaReadTaskArgs,
  MutationExecuteGithubCheckTaskArgs,
  MutationExecuteGithubDiscoverTaskArgs,
  MutationExecuteGithubReadTaskArgs,
  ResolverFn,
} from "../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { dataSourceToImpureGraphContext } from "../util";
import { readFromAirbyte } from "./airbyte-read";

/** @todo - Make Airbyte types available in api package */
type AirbyteCatalog = Array<{
  name?: string;
  json_schema?: JsonObject;
}>;

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
> = async (_, { config }, { dataSources, user, logger }) => {
  const context = dataSourceToImpureGraphContext(dataSources);

  const { taskExecutor } = dataSources;

  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  }

  try {
    return await readFromAirbyte({
      task: Task.GithubRead,
      user,
      taskExecutor,
      logger,
      context,
      config,
      integrationName: "Github",
    });
  } catch (err: any) {
    throw new ApolloError(`Task-execution failed: ${err}`);
  }
};

export const executeAsanaSpecTask: ResolverFn<
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
      .runTask(Task.AsanaSpec)
      .then((res) => JSON.stringify(res))
      .catch((err: any) => {
        throw new ApolloError(`Task-execution failed: ${err}`);
      });
  }
};

export const executeAsanaCheckTask: ResolverFn<
  Promise<string>,
  {},
  GraphQLContext,
  MutationExecuteAsanaCheckTaskArgs
> = async (_, { config }, { dataSources: { taskExecutor } }) => {
  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  } else {
    return await taskExecutor
      .runTask(Task.AsanaCheck, config)
      .then((res) => JSON.stringify(res))
      .catch((err) => {
        throw new ApolloError(`Task-execution failed: ${err}`);
      });
  }
};

export const executeAsanaDiscoverTask: ResolverFn<
  Promise<string>,
  {},
  LoggedInGraphQLContext,
  MutationExecuteAsanaDiscoverTaskArgs
> = async (_, { config }, { dataSources: { taskExecutor } }) => {
  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  } else {
    try {
      const catalog: AirbyteCatalog = await taskExecutor.runTask(
        Task.AsanaDiscover,
        config,
      );

      return JSON.stringify(catalog);
    } catch (err: any) {
      throw new ApolloError(`Task-execution failed: ${err}`);
    }
  }
};

export const executeAsanaReadTask: ResolverFn<
  Promise<string>,
  {},
  LoggedInGraphQLContext,
  MutationExecuteAsanaReadTaskArgs
> = async (_, { config }, { dataSources, user, logger }) => {
  const context = dataSourceToImpureGraphContext(dataSources);

  const { taskExecutor } = dataSources;

  if (!taskExecutor) {
    throw new ApolloError(
      "A task-executor wasn't started, so external tasks can't be started",
    );
  }

  try {
    return await readFromAirbyte({
      task: Task.AsanaRead,
      user,
      taskExecutor,
      logger,
      context,
      config,
      integrationName: "Asana",
    });
  } catch (err: any) {
    throw new ApolloError(`Task-execution failed: ${err}`);
  }
};
