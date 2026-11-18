/** The most entities a flow step reads from the graph. More fails the step, rather than leaving some out. */
export const maxEntitiesPerStep = 100_000;

/** The most entities a Draft message step gives the model as context. More fails the step, rather than leaving some out. */
export const maxDraftMessageEntities = 20;
