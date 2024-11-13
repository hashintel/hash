import { useEffect, useRef } from "react";

/**
 * A development utility to log which dependencies changed, to help debug hook re-runs.
 *
 * @example useWhatChanged([myDep, anotherDep], ["myDep", "anotherDep"]);
 *
 * Inspired by https://github.com/simbathesailor/use-what-changed but without logging the values,
 * as this can cause issues if the dependencies are very large objects/arrays.
 */
export const useWhatChanged = (dependencies: unknown[], labels: string[]) => {
  const previousDepsRef = useRef<unknown[] | null>();

  useEffect(() => {
    if (previousDepsRef.current) {
      const now = new Date();
      for (const [index, dep] of dependencies.entries()) {
        if (dep !== previousDepsRef.current[index]) {
          // eslint-disable-next-line no-console
          console.info(
            `[${now.toISOString()}]: Dependency at index ${index} (${labels[index]}) changed.`,
          );
        }
      }
    }
    previousDepsRef.current = dependencies;
  }, [dependencies, labels]);
};
