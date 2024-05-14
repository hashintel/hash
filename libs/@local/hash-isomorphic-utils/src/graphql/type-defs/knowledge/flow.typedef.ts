import { gql } from "apollo-server-express";

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
    INFORMATION_REQUIRED
    FAILED
    TIMED_OUT
    CANCEL_REQUESTED
    CANCELLED
  }

  scalar ArbitraryJsonData
  scalar ExternalInputRequest
  scalar StepInput
  scalar StepRunOutput
  scalar StepProgressLog

  type StepRun {
    """
    id for the step
    @todo do we also want nodeId to link it to the Step Definition, where there might be multiple steps per node definition
          in the case of spawning multiple parallel executions of a particular action?
    """
    stepId: String!
    """
    The type of step, i.e a name for what action it is performing, e.g. Persist Entities
    @todo do we need this? it can be derived from the step definition.
    @todo is this actually stepName, and we want a separate stepType of Action, Trigger etc?
    """
    stepType: String!
    """
    When the step was LAST scheduled for execution - this may have happened previously if a previous execution failed.
    See https://docs.temporal.io/activities#activity-execution for execution details
    """
    scheduledAt: String!
    """
    When execution of a step was LAST started - there may be earlier executions which failed.
    Note that this event is not written to the history until execution completes (successfully or unsuccessfully)
    """
    startedAt: String
    """
    Starting at 1, the number of times execution of this step has been attempted.
    """
    attempt: Int!
    """
    When the step last execution attempt finished, either successfully or unsuccessfully.
    Another execution may yet be scheduled – check retryState.
    """
    closedAt: String
    """
    If the last execution failed, what retry policy applies.
    """
    retryState: String
    """
    Details of the last failure, if any.
    The step may still be running if it has been retried since the last failure.
    """
    lastFailure: ArbitraryJsonData
    """
    The status of the step
    """
    status: FlowStepStatus!
    """
    Logs from the step, reporting on progress as it executes
    """
    logs: [StepProgressLog!]!
    """
    Inputs to the step
    """
    inputs: [StepInput!]
    """
    Outputs of the step
    """
    outputs: [StepRunOutput!]
  }

  type FlowRun {
    """
    The uuid of the Temporal workflow, which is unique across currently-executing flow runs.

    There may be multiple runs with the same workflowId if a flow is 'continued as new' (see Temporal docs)
    – the same workflowId is the mechanism by which consecutive runs which continue from a previous can be identified.

    While Temporal allows for re-use of workflowId across arbitrary flows, our business logic does not re-use them,
    and they are only re-used in the 'continue as new' case.
    """
    workflowId: String!
    """
    The uuid of the Temporal workflow run, which is unique among all flow executions.
    """
    runId: String!
    """
    The id for the definition of the flow this run is executing (the template for the flow)
    """
    flowDefinitionId: String!
    """
    Details of the run's status, inputs, outputs etc
    """
    status: FlowRunStatus!
    """
    When the run was triggered
    """
    startedAt: String!
    """
    When the run began executing
    """
    executedAt: String
    """
    When the run stopped
    """
    closedAt: String
    """
    Inputs to the flow run
    """
    inputs: ArbitraryJsonData
    """
    Outputs of the flow run
    """
    outputs: [StepRunOutput!]
    """
    Any requests for external input made by steps within the Flow
    """
    inputRequests: [ExternalInputRequest!]!
    """
    The steps in the flow
    """
    steps: [StepRun!]!
  }

  extend type Query {
    getFlowRuns(
      flowTypes: [String!]
      executionStatus: FlowRunStatus
    ): [FlowRun!]!
  }

  scalar FlowDefinition
  scalar FlowTrigger
  scalar ExternalInputResponseSignal

  extend type Mutation {
    """
    Start a new flow run, and return its workflowId to allow for identifying it later.
    """
    startFlow(
      flowDefinition: FlowDefinition!
      flowTrigger: FlowTrigger!
      webId: OwnedById!
    ): ID!

    """
    Submit a response to a request from a flow step for external input
    """
    submitExternalInputResponse(
      response: ExternalInputResponseSignal!
      flowUuid: ID!
    ): Boolean!
  }
`;
