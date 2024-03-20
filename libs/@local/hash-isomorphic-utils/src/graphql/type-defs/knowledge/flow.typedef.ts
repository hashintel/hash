import { gql } from "@apollo/client";

export const flowTypedef = gql`
  enum FlowRunStatus {
    """
    Actively progressing or waiting on something
    """
    RUNNING
    """
    Returned an error and failed
    """
    FAILED
    """
    Completed successfully
    """
    COMPLETED
    """
    Successfully handled a cancellation request
    """
    CANCELLED
    """
    Was terminated
    """
    TERMINATED
    """
    Reached a timeout limit
    """
    TIMED_OUT
    """
    The run was closed in favour of spawning a new run with the same parameters and a fresh event history
    See https://docs.temporal.io/workflows#continue-as-new
    """
    CONTINUED_AS_NEW

    UNKNOWN
    UNSPECIFIED
  }

  enum FlowStepStatus {
    SCHEDULED
    STARTED
    COMPLETED
    FAILED
    TIMED_OUT
    CANCEL_REQUESTED
    CANCELED
  }

  scalar ArbitraryJsonData

  type StepRun {
    """
    id for the step
    """
    stepId: String!
    """
    When the step was started
    """
    startTime: String!
    """
    When the step completed
    """
    closeTime: String
    """
    The status of the step
    """
    status: FlowStepStatus!
    """
    Inputs to the step
    """
    inputs: ArbitraryJsonData
    """
    Outputs of the step
    """
    outputs: ArbitraryJsonData
  }

  type FlowRun {
    """
    The identifier for this specific run of a Flow definition
    """
    runId: String!
    """
    The id for the definition of the Flow this run is executing
    """
    flowDefinitionId: String!
    """
    Details of the run's status, inputs, outputs etc
    """
    status: FlowRunStatus!
    """
    When the run was triggered
    """
    startTime: String!
    """
    When the run began executing
    """
    executionTime: String
    """
    When the run stopped
    """
    closeTime: String
    """
    Inputs to the flow run
    """
    inputs: ArbitraryJsonData
    """
    Outputs of the flow run
    """
    outputs: ArbitraryJsonData
  }

  extend type Query {
    getFlowRuns: [FlowRun!]!
  }
`;
