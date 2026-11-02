/**
 * MOCK: a flow's past runs, for option F's Runs panel (Explorations 903:39224). The prototype runs nothing, so each
 * flow with steps gets the same four daily 09:00 runs; yesterday's failed at its Ask a person step (or its last step).
 */
import {
  type EditorDocument,
  flattenSteps,
  START_ID,
  stepTitle,
} from "./document";

export type MockRun = {
  id: string;
  when: string;
  /** The step it stopped at, when it failed. */
  failedAt?: { stepId: string; label: string };
};

export const mockRuns = (document: EditorDocument): MockRun[] => {
  const steps = flattenSteps(document.steps).map(({ step }) => step);
  if (steps.length === 0) {
    return [];
  }
  const failing =
    steps.find(
      (step) =>
        step.kind === "action" && step.actionDefinitionId === "requestReview",
    ) ?? steps[steps.length - 1]!;
  return [
    { id: "today", when: "Today, 09:00" },
    {
      id: "yesterday",
      when: "Yesterday, 09:00",
      failedAt: { stepId: failing.stepId, label: stepTitle(failing) },
    },
    { id: "mon", when: "Mon 31 Oct, 09:00" },
    { id: "sun", when: "Sun 30 Oct, 09:00" },
  ];
};

export const runStatus = (run: MockRun) =>
  run.failedAt ? `Failed at ${run.failedAt.label}` : "Succeeded";

/** How a step did in a run: done before the failure, failed at it, or not reached after it. */
export const stepRunStatus = (
  document: EditorDocument,
  run: MockRun,
  stepId: string,
): "done" | "failed" | null => {
  if (!run.failedAt) {
    return "done";
  }
  if (stepId === run.failedAt.stepId) {
    return "failed";
  }
  if (stepId === START_ID) {
    return "done";
  }
  const order = flattenSteps(document.steps).map(({ step }) => step.stepId);
  return order.indexOf(stepId) < order.indexOf(run.failedAt.stepId)
    ? "done"
    : null;
};
