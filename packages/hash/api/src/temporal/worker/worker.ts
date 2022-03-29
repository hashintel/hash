import { Worker } from "@temporalio/worker";
import * as exampleActivities from "./exampleActivities";

async function run() {
  // Step 1: Register Workflows and Activities with the Worker and connect to
  // the Temporal server.
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: {
      ...exampleActivities,
    },
    taskQueue: "hello-world",
  });
  // Worker connects to localhost by default and uses console.error for logging.
  // Customize the Worker by passing more options to create():
  // https://typescript.temporal.io/api/classes/worker.Worker
  // If you need to configure server connection parameters, see docs:
  // https://docs.temporal.io/docs/typescript/security#encryption-in-transit-with-mtls

  // Step 2: Start accepting tasks on the `tutorial` queue
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
