import { ApolloError } from "apollo-server-express";
import { Tasks } from "../../../task-execution";
import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

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
