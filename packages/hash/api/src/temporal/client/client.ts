import { Connection, WorkflowClient } from "@temporalio/client";
import { example } from "../worker/workflows";

export function createTemporalPool(options: {
  // TODO: Consider if there are other env vars we should set up
  address: string;
  useNamespace?: string;
}) {
  const connection = new Connection({
    // Connect to localhost with default ConnectionOptions.
    // In production, pass options to the Connection constructor to configure TLS and other settings:
    address: options.address, // as provisioned
    // tls: {} // as provisioned
  });

  return {
    createWorkspaceClient(_options: {
      // Perhaps use an org account id for namespacing? (tbf: we don't really understand namespaces, yet.)
      //   accountId?: string;
    }) {
      const client = new WorkflowClient(connection.service, {
        // e.g.
        // namespace: accountId ? `wk-${accountId}` : undefined, // TODO: change if you have a different namespace
      });

      return {
        startHello() {
          // eslint is wrong, the function below is hoisted because it is a named `function`.
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          return startHello(client);
        },
      };
    },
  };
}

async function startHello(client: WorkflowClient) {
  const handle = await client.start(example, {
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
