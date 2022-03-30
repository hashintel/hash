import { Worker } from "@temporalio/worker";
import * as integrationActivities from "./integrationActivities";
import { TASK_QUEUES } from "./TASK_QUEUES";

async function run() {
  // Step 1: Register Workflows and Activities with the Worker and connect to
  // the Temporal server.
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: {
      ...integrationActivities,
    },
    taskQueue: TASK_QUEUES.mvpTestingHelloWorld,
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
  // Do we need to hook this error up via morgan logger?
  //  * This will depend on how we structure the deployment (because the worker might be put into its own separate container/pod from api)
  //  * Notice that the worker by default (at `Worker.create`) also uses console.error for reporting...
  // eslint-disable-next-line
  console.error(err);
  process.exit(1);
});
