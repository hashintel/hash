import { WorkflowClient } from "@temporalio/client";

export class OrganizationWorkflowClient {
  /** @internal */
  constructor(
    public readonly workflowClient: WorkflowClient,
    public readonly namespace: string,
    private options: {
      organizationAccountId: string;
    },
  ) {
    if (typeof options.organizationAccountId !== "string") {
      throw new Error("Expected organizationAccountId to be defined");
    }
  }

  get orgAccountId() {
    return this.options.organizationAccountId;
  }
}
