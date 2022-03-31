import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { Core, Worker } from "@temporalio/worker";
import * as integrationActivities from "./integrationActivities";
import { TASK_QUEUES } from "./TASK_QUEUES";

// By importing @hashintel/hash-backend-utils/environment, we're also configuring around dotenv
const temporalHost = getRequiredEnv("HASH_TEMPORAL_HOST");
const temporalPort = parseInt(getRequiredEnv("HASH_TEMPORAL_PORT"), 10);

async function run() {
  // See https://docs.temporal.io/docs/typescript/security/#encryption-in-transit-with-mtls
  await Core.install({
    serverOptions: {
      address: `${temporalHost}:${temporalPort}`,
      // You can set the namespace, but you might need to then
      // manage workers on a per-organization basis (spinning up workers for each org)
      // Perhaps this can be managed automatically through some queue listener within temporal?
      // namespace:
    },
  });
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
