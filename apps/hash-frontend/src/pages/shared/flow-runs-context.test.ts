import { describe, expect, it } from "vitest";

import { generateStepRunId } from "@local/hash-isomorphic-utils/flows/step-run-id";

import { FlowRunStatus, FlowStepStatus } from "../../graphql/api-types.gen";
import { getShownStepRun, getStatusForSteps } from "./flow-runs-context";

import type { StepRun } from "../../graphql/api-types.gen";

const stepRun = (stepId: string, status: FlowStepStatus): StepRun => ({
  attempt: 1,
  logs: [],
  scheduledAt: "2026-01-01T00:00:00.000Z",
  status,
  stepId,
  stepType: "action",
});

/** A step before a `for-each`, and a step inside it, with a run per item. */
const steps = [
  { stepId: "fetch" },
  { stepId: "forEach" },
  { stepId: "summarise", parentStepId: "forEach" },
];

describe("getStatusForSteps", () => {
  it("counts the runs of a step inside a for-each towards it and the for-each, until every item's run is complete", () => {
    const running = getStatusForSteps(
      {
        closedAt: null,
        status: FlowRunStatus.Running,
        steps: [
          stepRun("fetch", FlowStepStatus.Completed),
          stepRun(generateStepRunId("summarise", 0), FlowStepStatus.Completed),
          stepRun(generateStepRunId("summarise", 1), FlowStepStatus.Started),
        ],
      },
      steps,
    );

    expect(running.overallStatus).toBe("In Progress");
    expect(running.statusByStep).toEqual({
      fetch: "Complete",
      forEach: "In Progress",
      summarise: "In Progress",
    });

    const complete = getStatusForSteps(
      {
        closedAt: null,
        status: FlowRunStatus.Running,
        steps: [
          stepRun("fetch", FlowStepStatus.Completed),
          stepRun(generateStepRunId("summarise", 0), FlowStepStatus.Completed),
          stepRun(generateStepRunId("summarise", 1), FlowStepStatus.Completed),
        ],
      },
      steps,
    );

    expect(complete.overallStatus).toBe("Complete");
    expect(complete.statusByStep.summarise).toBe("Complete");
  });
});

describe("getShownStepRun", () => {
  it("shows the run of a step inside a for-each whose status most needs attention", () => {
    const failed = stepRun(
      generateStepRunId("summarise", 1),
      FlowStepStatus.Failed,
    );

    expect(
      getShownStepRun(
        [
          stepRun(generateStepRunId("summarise", 0), FlowStepStatus.Completed),
          failed,
          stepRun(generateStepRunId("summarise", 2), FlowStepStatus.Started),
        ],
        "summarise",
      ),
    ).toBe(failed);
  });
});
