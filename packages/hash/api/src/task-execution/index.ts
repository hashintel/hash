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
        return new Error(`Failed to execute task ${route}: ${err}`);
      }
    },
  };
};
