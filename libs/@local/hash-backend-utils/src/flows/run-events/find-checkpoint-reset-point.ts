import proto from "@temporalio/proto";

type IHistoryEvent = proto.temporal.api.history.v1.IHistoryEvent;

const { EventType } = proto.temporal.api.enums.v1;

/**
 * Where to reset a run to a checkpoint: the end of the first workflow task to start after the checkpoint's signal,
 * the task in which the workflow first sees it. Temporal fails that task and runs it again, so the reset run starts
 * from the checkpoint. A workflow task already running when the signal arrives ends after the signal without seeing
 * it, so it's the next one.
 *
 * Temporal also accepts a workflow task's start, but refuses some ("this event must be at the boundary"), where it
 * accepts the same task's end.
 *
 * @returns the event's id, or `null` if no workflow task has started and ended since the signal.
 */
export const findCheckpointResetPoint = (
  history: IHistoryEvent[],
  checkpointEventId: number,
): number | null => {
  const taskStartedEventId = history.find(
    (event) =>
      event.eventType === EventType.EVENT_TYPE_WORKFLOW_TASK_STARTED &&
      Number(event.eventId) > checkpointEventId,
  )?.eventId;

  if (taskStartedEventId === undefined || taskStartedEventId === null) {
    return null;
  }

  const taskEnded = history.find(
    (event) =>
      Number(
        (
          event.workflowTaskCompletedEventAttributes ??
          event.workflowTaskFailedEventAttributes ??
          event.workflowTaskTimedOutEventAttributes
        )?.startedEventId,
      ) === Number(taskStartedEventId),
  );

  return taskEnded ? Number(taskEnded.eventId) : null;
};
