import { DataSource } from "apollo-datasource";
import fetch from "node-fetch";

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
