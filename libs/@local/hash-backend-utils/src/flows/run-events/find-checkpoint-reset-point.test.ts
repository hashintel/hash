import proto from "@temporalio/proto";
import { describe, expect, it } from "vitest";

import { findCheckpointResetPoint } from "./find-checkpoint-reset-point.js";

const { EventType } = proto.temporal.api.enums.v1;

const { HistoryEvent } = proto.temporal.api.history.v1;

const signaled = (eventId: number) =>
  HistoryEvent.fromObject({
    eventId,
    eventType: EventType.EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED,
  });

const taskScheduled = (eventId: number) =>
  HistoryEvent.fromObject({
    eventId,
    eventType: EventType.EVENT_TYPE_WORKFLOW_TASK_SCHEDULED,
  });

const taskStarted = (eventId: number) =>
  HistoryEvent.fromObject({
    eventId,
    eventType: EventType.EVENT_TYPE_WORKFLOW_TASK_STARTED,
  });

const taskCompleted = (eventId: number, startedEventId: number) =>
  HistoryEvent.fromObject({
    eventId,
    eventType: EventType.EVENT_TYPE_WORKFLOW_TASK_COMPLETED,
    workflowTaskCompletedEventAttributes: { startedEventId },
  });

describe("findCheckpointResetPoint", () => {
  it("finds the end of the workflow task that starts after a checkpoint signalled between tasks", () => {
    const history = [
      signaled(40),
      taskScheduled(41),
      taskStarted(42),
      taskCompleted(43, 42),
    ];

    expect(findCheckpointResetPoint(history, 40)).toBe(43);
  });

  it("finds the end of the next workflow task for a checkpoint signalled while one runs", () => {
    const history = [
      taskStarted(38),
      signaled(39),
      taskCompleted(40, 38),
      taskScheduled(41),
      taskStarted(42),
      taskCompleted(43, 42),
    ];

    expect(findCheckpointResetPoint(history, 39)).toBe(43);
  });

  it("finds nothing before a workflow task has started and ended since the checkpoint", () => {
    const history = [signaled(40), taskScheduled(41), taskStarted(42)];

    expect(findCheckpointResetPoint(history, 40)).toBeNull();
  });
});
