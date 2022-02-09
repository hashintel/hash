/**
 * Sleeps for `ms` milliseconds
 *
 * Avoids adding https://www.npmjs.com/package/sleep-promise as a dependency
 */
export const sleep = (ms: number) =>
  new Promise<"TIMEOUT">((resolve) => {
    setTimeout(() => resolve("TIMEOUT"), ms);
  });
