import { AsyncLocalStorage } from "node:async_hooks";

import type { FlueExecutionInterceptor } from "@flue/runtime";

/** The submission and model call that the current execution belongs to. */
export type ModelCallScope = {
  readonly submissionId: string | undefined;
  readonly turnId: string | undefined;
};

/**
 * Follows Flue's operations so a provider stream knows its submission and
 * turn. Flue sets `submissionId` only on the agent operation's context, so
 * the model operation inside it inherits the ID from the enclosing scope.
 */
export const createModelCallScope = () => {
  const storage = new AsyncLocalStorage<ModelCallScope>();
  const interceptor: FlueExecutionInterceptor = (operation, context, next) => {
    const enclosing = storage.getStore();
    return storage.run(
      {
        submissionId: context.submissionId ?? enclosing?.submissionId,
        turnId:
          operation.type === "model" ? operation.turnId : enclosing?.turnId,
      },
      next,
    );
  };
  return {
    interceptor,
    current: (): ModelCallScope | undefined => storage.getStore(),
  };
};
