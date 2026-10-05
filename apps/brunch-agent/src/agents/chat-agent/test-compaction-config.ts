import { brunchEnv } from "@hashintel/brunch-agent";

import type { CompactionConfig } from "@flue/runtime";

/** Local probe configuration; never alter deployed compaction through this seam. */
export const loadTestCompactionConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): CompactionConfig | undefined => {
  const source = environment[brunchEnv.testKeepRecentTokens];
  if (source === undefined) return undefined;

  if (
    environment.NODE_ENV !== undefined &&
    environment.NODE_ENV !== "development" &&
    environment.NODE_ENV !== "test"
  ) {
    throw new Error(
      `${brunchEnv.testKeepRecentTokens} is only allowed in local development or tests, never production.`,
    );
  }

  const value = source.trim();
  const keepRecentTokens = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(keepRecentTokens)) {
    throw new Error(
      `${brunchEnv.testKeepRecentTokens} must be a non-negative safe integer in decimal notation.`,
    );
  }
  return { keepRecentTokens };
};
