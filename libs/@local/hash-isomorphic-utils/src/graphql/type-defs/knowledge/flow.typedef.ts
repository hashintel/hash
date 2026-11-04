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
    """
    The step didn't run, because a value it needs is missing.
    """
    SKIPPED
  }

  scalar EntityUuid
  scalar ExternalInputRequest
  scalar FlowInputValues
  scalar ResolvedPayload
  scalar FlowDataSources
  scalar ExternalInputResponseWithoutUser
  scalar ScheduleSpec
  scalar CreateFlowScheduleInput
  scalar UpdateFlowScheduleInput
  scalar FlowRunEvent
  scalar FlowDefinitionDiagnostic

  type FlowRunOutput {
    outputName: String!
    """
    The output's value, with any payload the run stored elsewhere resolved.
    """
    payload: ResolvedPayload!
  }

  """
  A run of a step: the step's id in the flow definition and, inside \`forEach\` steps, its item's index in each,
  outermost first.
  """
  type FlowRunStepRun {
    stepId: String!
    itemPath: [Int!]!
  }

  type FlowRunError {
    message: String!
    """
    The code of the status the run or step failed with (a \`StatusCode\` from \`@local/status\`), when it gave one.
    """
    code: String
  }

  """
  A step that failed after its action returned, e.g. because an output was of the wrong kind.
  """
  type FlowRunStepError {
    stepRun: FlowRunStepRun!
    error: FlowRunError!
  }

  """
  A run as its Flow Run entity describes it, for lists of runs.
  """
  type FlowRunSummary {
    """
    The entity id of the run's Flow Run entity.
    """
    flowRunEntityId: EntityId!
    """
    The id of the schedule that triggered this run, if any.
    Only present for flow runs triggered by a FlowSchedule.
    """
    flowScheduleId: EntityUuid
    """
    The entity id of the Flow Definition entity this run is executing.
    """
    flowDefinitionEntityId: EntityId!
    """
    A user-facing name for the flow run to distinguish it from other runs of its kind,
    which might include a key input or a summary of its key inputs.
    """
    name: String!
    """
    The web this flow run is associated with
    """
    webId: WebId!
    status: FlowRunStatus!
    """
    When the run was triggered. Resetting the run doesn't change it.
    """
    startedAt: String!
    """
    When the run stopped
    """
    closedAt: String
    """
    The values given to the flow's inputs
    """
    flowInputs: FlowInputValues!
    """
    The run's requests for input that haven't been answered, latest first. Empty once the run has stopped.
    """
    openInputRequests: [ExternalInputRequest!]!
  }

  """
  A run, with what its record says about how it went.
  """
  type FlowRun {
    """
    The entity id of the run's Flow Run entity.
    """
    flowRunEntityId: EntityId!
    """
    The id of the schedule that triggered this run, if any.
    Only present for flow runs triggered by a FlowSchedule.
    """
    flowScheduleId: EntityUuid
    """
    The entity id of the Flow Definition entity this run is executing.
    """
    flowDefinitionEntityId: EntityId!
    """
    A user-facing name for the flow run to distinguish it from other runs of its kind,
    which might include a key input or a summary of its key inputs.
    """
    name: String!
    """
    The web this flow run is associated with
    """
    webId: WebId!
    status: FlowRunStatus!
    """
    When the run was triggered. Resetting the run doesn't change it.
    """
    startedAt: String!
    """
    When the run stopped
    """
    closedAt: String
    """
    The values given to the flow's inputs
    """
    flowInputs: FlowInputValues!
    """
    The data sources the run's AI steps can use. Only present for AI flow runs.
    """
    dataSources: FlowDataSources
    """
    The flow's outputs, once the run has completed.
    """
    outputs: [FlowRunOutput!]
    """
    Why the run failed, or the reason it was terminated with, once it has ended.
    """
    failure: FlowRunError
    """
    Steps that failed after their action returned, once the run has ended, if it records them.
    """
    stepErrors: [FlowRunStepError!]
    """
    The run's requests for input that haven't been answered, latest first. Empty once the run has stopped.
    """
    openInputRequests: [ExternalInputRequest!]!
    """
    What happened in the run, in the order its history records it.
    Ask again with \`endCursor\` to follow a run, and handle \`restarted\` before appending.
    """
    events(
      """
      The \`endCursor\` of an earlier page. The page starts after it.
      """
      after: String
      """
      How many events to return: 500 by default, and at most 2,000.
      """
      first: Int
    ): FlowRunEventsPage!
  }

  type FlowRunEventsPage {
    """
    Each event is a \`FlowRunEvent\` from \`@local/hash-isomorphic-utils/flows/run-events\`, told apart by its \`kind\`.
    """
    events: [FlowRunEvent!]!
    """
    The cursor of the page's last event, to ask for the next page with: the cursor given when the page is empty,
    and null when the run has no events.
    """
    endCursor: String
    hasNextPage: Boolean!
    """
    The run of the workflow the events are from, which changes when the run is reset.
    """
    runId: String!
    """
    Whether the given cursor is from a run that has since been reset past it, so the events the client has after
    \`keptUpTo\` (or all of them, if it's null) no longer happened.
    """
    restarted: Boolean!
    """
    When \`restarted\`, the position of the last event the client has that the current run kept.
    """
    keptUpTo: String
  }

  """
  A flow definition as saved. A definition is saved even when it isn't valid yet, so that it can be finished later,
  but it can only run once none of its diagnostics is an error.
  """
  type FlowDefinitionSaveResult {
    """
    The entity id of the Flow Definition entity holding the definition.
    """
    flowDefinitionEntityId: EntityId!
    """
    The edition of the Flow Definition entity the save created, to give as \`expectedEditionId\` when saving it next.
    """
    editionId: EntityEditionId!
    """
    Every problem with the definition, including warnings, which don't stop it running. Each is a
    \`FlowDefinitionDiagnostic\` from \`@local/hash-isomorphic-utils/flows/validate-flow-definition\`, with the id of the
    step it's in, if any.
    """
    diagnostics: [FlowDefinitionDiagnostic!]!
    """
    Whether the flow can run: none of its diagnostics is an error.
    """
    isRunnable: Boolean!
  }

  type PaginatedFlowRuns {
    """
    The flow runs for the requested page
    """
    flowRuns: [FlowRunSummary!]!
    """
    The total number of flow run entities matching the filters.
    """
    totalCount: Int!
    """
    An opaque cursor for fetching the next page. Null when there are no more results.
    """
    nextCursor: String
  }

  extend type Query {
    getFlowRuns(
      """
      Return only flow runs of these Flow Definition entities
      """
      flowDefinitionEntityIds: [EntityId!]
      """
      Return only flows that match the given status
      """
      executionStatus: FlowRunStatus
      """
      An opaque cursor returned from a previous query, used to fetch the next page.
      """
      cursor: String
      """
      Maximum number of flow runs to return per page.
      Defaults to 100 and is capped at that value.
      Negative values are clamped to 0.
      """
      limit: Int
    ): PaginatedFlowRuns!

    getFlowRunById(flowRunEntityId: EntityId!): FlowRun!
  }

  extend type Mutation {
    """
    Start a new flow run, and return the entity id of its Flow Run entity to allow for identifying it later.
    """
    startFlow(
      dataSources: FlowDataSources
      flowDefinitionEntityId: EntityId!
      flowInputs: FlowInputValues!
      webId: WebId!
    ): EntityId!

    """
    Reset a flow to a specific checkpoint, available via the 'checkpoints' field on a run

    This will archive any claims discovered after the checkpoint.
    It does _NOT_ yet handle any other database mutations, e.g. entities persisted.

    Any API usage incurred at any point will still be recorded, whether or not it is after the checkpoint.
    """
    resetFlow(
      flowRunEntityId: EntityId!
      checkpointId: ID!
      eventId: Int!
    ): Boolean!

    """
    Cancel a flow, stopping its execution.

    This does _NOT_ roll back any database mutations made as part of the flow so far.
    """
    cancelFlow(flowRunEntityId: EntityId!): Boolean!

    """
    Submit a response to a request from a flow step for external input
    """
    submitExternalInputResponse(
      response: ExternalInputResponseWithoutUser!
      flowRunEntityId: EntityId!
    ): Boolean!

    """
    Save a new flow definition in a web. It's saved even if it isn't valid yet, as long as it has the shape of one.
    """
    createFlowDefinition(
      webId: WebId!
      """
      A \`FlowDefinition\` from \`@local/hash-isomorphic-utils/flows/types\`.
      """
      definition: JSONObject!
    ): FlowDefinitionSaveResult!

    """
    Replace a flow's definition. Runs already started keep the definition they started with.

    The save is refused if the flow has changed since \`expectedEditionId\`, or if the flow has active schedules and
    the new definition isn't valid or no longer takes the inputs they give it. Pause them first to make such a change.
    """
    updateFlowDefinition(
      flowDefinitionEntityId: EntityId!
      """
      The edition of the Flow Definition entity the new definition was made from.
      """
      expectedEditionId: EntityEditionId!
      """
      A \`FlowDefinition\` from \`@local/hash-isomorphic-utils/flows/types\`.
      """
      definition: JSONObject!
    ): FlowDefinitionSaveResult!

    """
    Archive a flow, pausing its active schedules first. Its past runs stay readable.
    """
    archiveFlowDefinition(flowDefinitionEntityId: EntityId!): Boolean!

    """
    Create a new flow schedule for recurring executions
    """
    createFlowSchedule(input: CreateFlowScheduleInput!): EntityUuid!

    """
    Update an existing flow schedule
    """
    updateFlowSchedule(
      scheduleEntityId: EntityId!
      input: UpdateFlowScheduleInput!
    ): Boolean!

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
