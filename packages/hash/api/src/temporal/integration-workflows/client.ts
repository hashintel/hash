import { WorkflowClient } from "@temporalio/client";
import { manageIntegration } from "./workflows";

async function startHello(client: WorkflowClient) {
  const handle = await client.start(manageIntegration, {
    args: ["Temporal"], // type inference works! args: [name: string]
    taskQueue: "hello-world",
    // in practice, use a meaningful business id, eg customerId or transactionId
    workflowId: `wf-id-${Math.floor(
      Math.random() * 1000,
    )}-${Date.now().toString(36)}`,
  });

  // temporary
  console.log(`Started workflow ${handle.workflowId}`);

  return handle.result();
}
