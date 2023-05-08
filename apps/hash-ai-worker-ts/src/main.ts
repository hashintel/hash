import * as path from "node:path";

import { Worker } from "@temporalio/worker";
import { config } from "dotenv-flow";

import * as activities from "./activities";

export const monorepoRootDir = path.resolve(__dirname, "../../..");

config({ silent: true, path: monorepoRootDir });

const workflowOption = () =>
  process.env.NODE_ENV === "production"
    ? {
        workflowBundle: {
          codePath: require.resolve("../workflow-bundle.js"),
        },
      }
    : { workflowsPath: require.resolve("./workflows") };

async function run() {
  const worker = await Worker.create({
    ...workflowOption(),
    activities,
    taskQueue: "ai",
  });

  await worker.run();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
