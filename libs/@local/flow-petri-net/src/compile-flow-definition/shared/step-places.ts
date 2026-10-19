/** The place holding a step's `Pending` token until it starts. */
export const pendingPlaceId = (stepId: string) => `p.pending.${stepId}`;

/** The place holding the item each run of a for-each step's nested steps is for. */
export const itemPlaceId = (forEachStepId: string) =>
  `p.forEach.${forEachStepId}.item`;

/** The place a step's token goes to when the step gives up, which fails its run. */
export const failedStepRunsPlaceId = "p.failedStepRuns";
