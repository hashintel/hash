// @todo this should be defined elsewhere

export type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;

/**
 * This allows you to collect calls to a function to run at the end of a tick
 */
export const collect = <P extends Array<any>>(
  handler: (calls: P[]) => void
): ((...args: P) => void) => {
  let id: ReturnType<typeof setImmediate> | null = null;
  let calls: P[] = [];

  return (...args: P) => {
    if (id !== null) {
      clearImmediate(id);
      id = null;
    }

    calls.push(args);

    id = setImmediate(() => {
      const thisCalls = calls;
      calls = [];
      handler(thisCalls);
    });
  };
};
