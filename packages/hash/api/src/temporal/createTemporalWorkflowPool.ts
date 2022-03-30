import { Connection, WorkflowClient } from "@temporalio/client";
import { OrganizationWorkflowClient } from "./clients/OrganizationWorkflowClient";

export function createTemporalWorkflowPool(poolOptions: {
  // TODO: Consider if there are other env vars we should set up
  address: string;
  useNamespace?: string;
}) {
  // encapsulate so we can ensure usage of temporal remains consistent across codebase.
  const connection = new Connection({
    // Configured through HASH_TEMPORAL_HOST & HASH_TEMPORAL_PORT
    address: poolOptions.address,
    // Consider in production, pass options to the Connection constructor to configure TLS and other settings:
    // tls: {} // as provisioned
  });

  return {
    createOrganizationWorkflowClient(options: {
      // Perhaps use an org account id for namespacing? (tbf: we don't really understand namespaces, yet.)
      organizationAccountId: string;
    }) {
      // Some places say that you shouldn't use namespaces due to complexity...
      // So, we'll stick to default.
      const namespace = "default"; // `org-${options.organizationAccountId}`;
      const client = new WorkflowClient(connection.service, {
        // SECURITY: Consider specifying dataConverter for use in securing data being stored in database by workflows
        // dataConverter: { .. }

        // See https://docs.temporal.io/docs/server/namespaces/
        namespace,
      });

      return new OrganizationWorkflowClient(client, namespace, {
        // not sure if this is actually a necessary thing to pass.
        // TODO: we should probably be passing in a Logger
        organizationAccountId: options.organizationAccountId,
      });
    },
  };
}
