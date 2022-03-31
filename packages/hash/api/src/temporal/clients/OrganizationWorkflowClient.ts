import { WorkflowClient } from "@temporalio/client";

export class OrganizationWorkflowClient {
  /** @internal */
  constructor(
    public readonly workflowClient: WorkflowClient,
    /** Namespace should pretty much always be "default" as long as we're spinning up a statically defined worker! */
    public readonly namespace: string,
    private options: {
      organizationEntityId: string;
    },
  ) {
    if (typeof options.organizationEntityId !== "string") {
      throw new Error("Expected organizationEntityId to be defined");
    }
  }

  get orgEntityId() {
    return this.options.organizationEntityId;
  }
}
