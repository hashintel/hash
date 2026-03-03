import { gql } from "graphql-tag";

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
  scalar EntityUuid
  scalar ExternalInputRequest
  scalar FlowInputs
  scalar StepInput
  scalar ResolvedStepRunOutput
  scalar StepProgressLog
  # FlowActionDefinitionId is just here so that the type is generated along with the other scalars,
  # as we need to pass it to FlowDefinition.
  scalar FlowActionDefinitionId
  scalar FlowDefinition
  scalar FlowDataSources
  scalar FlowTypeDataType
  scalar FlowTrigger
  scalar ExternalInputResponseWithoutUser
  scalar ScheduleSpec
  scalar CreateFlowScheduleInput
  scalar UpdateFlowScheduleInput

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
    outputs: [ResolvedStepRunOutput!]
  }

  type FlowRun {
    """
    The uuid of the flow run.
    This is equivalent to the EntityUuid of the Flow entity.
    """
    flowRunId: EntityUuid!
    """
    The id of the schedule that triggered this run, if any.
    Only present for flow runs triggered by a FlowSchedule.
    """
    flowScheduleId: EntityUuid
    """
    The id for the definition of the flow this run is executing (the template for the flow)
    """
    flowDefinitionId: String!
    """
    A user-facing name for the flow run to distinguish it from other runs of its kind,
    which might include a key input or a summary of its key inputs.
    """
    name: String!
    """
    The web this flow run is associated with
    """
    webId: WebId!
    """
    Details of the run's status, inputs, outputs etc
    """
    status: FlowRunStatus!
    """
    When the run was triggered
    """
    startedAt: String!
    """
    When the run began executing (which may be after it was started if it has a delay before execution)
    """
    executedAt: String
    """
    When the run stopped
    """
    closedAt: String
    """
    The reason the run failed, if it did
    """
    failureMessage: String
    """
    Inputs to the flow run
    """
    inputs: FlowInputs!
    """
    Outputs of the flow run
    """
    outputs: [ResolvedStepRunOutput!]
    """
    Any requests for external input made by steps within the Flow
    """
    inputRequests: [ExternalInputRequest!]!
    """
    The steps in the flow
    """
    steps: [StepRun!]!
  }

  type PaginatedFlowRuns {
    """
    The flow runs for the requested page
    """
    flowRuns: [FlowRun!]!
    """
    The total number of flow runs matching the filters (before pagination)
    """
    totalCount: Int!
  }

  extend type Query {
    getFlowRuns(
      """
      Return only flow runs that are based off specific definitions
      """
      flowDefinitionIds: [String!]
      """
      Return only flows that match the given status
      """
      executionStatus: FlowRunStatus
      """
      Number of flow runs to skip (for offset-based pagination).
      When omitted, all matching flow runs are returned.
      """
      offset: Int
      """
      Maximum number of flow runs to return (for offset-based pagination).
      When omitted, all matching flow runs are returned.
      """
      limit: Int
    ): PaginatedFlowRuns!

    getFlowRunById(flowRunId: String!): FlowRun!
  }

  extend type Mutation {
    """
    Start a new flow run, and return its flowRunId to allow for identifying it later.
    """
    startFlow(
      dataSources: FlowDataSources
      flowDefinition: FlowDefinition!
      flowTrigger: FlowTrigger!
      flowType: FlowTypeDataType!
      webId: WebId!
    ): EntityUuid!

    """
    Reset a flow to a specific checkpoint, available via the 'checkpoints' field on a run

    This will archive any claims discovered after the checkpoint.
    It does _NOT_ yet handle any other database mutations, e.g. entities persisted.

    Any API usage incurred at any point will still be recorded, whether or not it is after the checkpoint.
    """
    resetFlow(flowUuid: ID!, checkpointId: ID!, eventId: Int!): Boolean!

    """
    Cancel a flow, stopping its execution.

    This does _NOT_ roll back any database mutations made as part of the flow so far.
    """
    cancelFlow(flowUuid: ID!): Boolean!

    """
    Submit a response to a request from a flow step for external input
    """
    submitExternalInputResponse(
      response: ExternalInputResponseWithoutUser!
      flowUuid: ID!
    ): Boolean!

    """
    Create a new flow schedule for recurring executions
    """
    createFlowSchedule(input: CreateFlowScheduleInput!): EntityUuid!

    """
    Update an existing flow schedule
    """
    updateFlowSchedule(scheduleEntityId: EntityId!, input: UpdateFlowScheduleInput!): Boolean!

    """
    Pause a flow schedule, stopping future executions until resumed
    """
    pauseFlowSchedule(scheduleEntityId: EntityId!, note: String): Boolean!

    """
    Resume a paused flow schedule
    """
    resumeFlowSchedule(scheduleEntityId: EntityId!): Boolean!

    """
    Archive a flow schedule, permanently stopping executions
    """
    archiveFlowSchedule(scheduleEntityId: EntityId!): Boolean!
  }
`;
