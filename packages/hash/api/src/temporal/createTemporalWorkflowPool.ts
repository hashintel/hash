import { Connection, WorkflowClient } from "@temporalio/client";
import { DataSource } from "apollo-datasource";
import { OrganizationWorkflowClient } from "./clients/OrganizationWorkflowClient";

type TemporalPoolOptions = {
  address: string;
  // not used due to initial complexity
  // useNamespace?: string;
};

// While this would require fewer types as a closure, it appears that we kinda
// need to use a class to be able to extend apollo's DataSource
export class TemporalAdapter
  extends DataSource
  implements TemporalWorkflowPool
{
  private connection: Connection;
  constructor(poolOptions: TemporalPoolOptions) {
    super();
    // encapsulate so we can ensure usage of temporal remains consistent across codebase.
    this.connection = new Connection({
      // Configured through HASH_TEMPORAL_HOST & HASH_TEMPORAL_PORT
      address: poolOptions.address,
      // Consider in production, pass options to the Connection constructor to configure TLS and other settings:
      // tls: {} // as provisioned
    });
  }

  createOrganizationWorkflowClient(options: {
    // Perhaps use an org account id for namespacing? (tbf: we don't really understand namespaces, yet.)
    organizationEntityId: string;
  }) {
    // Some places say that you shouldn't use namespaces due to complexity...
    // The complexity seems to be related to needing to spin up a separate worker.ts for each namespace
    // to ensure separations.
    // So, we'll stick to default.
    const namespace = "default"; // `org-${options.organizationAccountId}`;
    const client = new WorkflowClient(this.connection.service, {
      // SECURITY: Consider specifying dataConverter for use in securing data being stored in database by workflows
      // dataConverter: { .. }

      // See https://docs.temporal.io/docs/server/namespaces/
      namespace,
    });

    return new OrganizationWorkflowClient(client, namespace, {
      // not sure if this is actually a necessary thing to pass.
      // TODO: we should probably be passing in a Logger
      organizationEntityId: options.organizationEntityId,
    });
  }
}
export interface TemporalWorkflowPool extends DataSource {
  createOrganizationWorkflowClient(options: {
    // Perhaps use an org account id for namespacing? (tbf: we don't really understand namespaces, yet.)
    organizationEntityId: string;
  }): OrganizationWorkflowClient;
}

export function createTemporalWorkflowPool(
  poolOptions: TemporalPoolOptions,
): TemporalWorkflowPool {
  return new TemporalAdapter(poolOptions);
}
