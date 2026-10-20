/**
 * The key of a step's instance of its action's subnet. Instances have keys of their own, as step ids can be any
 * string, such as one that is also the key of a place.
 */
export const instanceKey = (stepId: string) => `i.${stepId}`;

/** The place holding a step's `Pending` token until it starts. */
export const pendingPlaceId = (stepId: string) => `p.pending.${stepId}`;

/** The place holding the item each run of a for-each step's nested steps is for. */
export const itemPlaceId = (forEachStepId: string) =>
  `p.forEach.${forEachStepId}.item`;

/** The place a step's token goes to when the step gives up, which fails its run. */
export const failedStepRunsPlaceId = "p.failedStepRuns";
