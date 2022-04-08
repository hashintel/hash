import { DataSource } from "apollo-datasource";
import fetch from "node-fetch";

// TODO: When task scheduling is more mature and we move away from the temporary `hash-task-executor` we should have a single source of
//  truth for available tasks, likely importable.
export enum Tasks {
  Demo = "python",
}

export type Config = {
  host: string;
  port: number;
};

export type TaskExecutor = ReturnType<typeof connectToTaskExecutor> &
  DataSource;

// A pretty dumb method at the moment, but provides a clean boundary where we can slot in logic for a more complex task-execution mechanism later on
/**
 *
 * @param config The connection config for connecting to the Task-Executor
 * @returns a connection object with a run_task method
 */
export const connectToTaskExecutor = (config: Config) => {
  return {
    run_task: async (route: Tasks) => {
      try {
        return await fetch(
          `http://${config.host}:${config.port}/${route}`,
        ).then((resp) => resp.json());
      } catch (err: any) {
        throw new Error(`Failed to execute task ${route}: ${err}`);
      }
    },
  };
};
