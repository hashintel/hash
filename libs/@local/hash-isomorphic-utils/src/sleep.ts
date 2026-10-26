/**
 * Sleeps for `ms` milliseconds
 *
 * Avoids adding https://www.npmjs.com/package/sleep-promise as a dependency
 */
export const sleep = async (ms: number): Promise<"TIMEOUT"> =>
  // oxlint-disable-next-line promise/avoid-new -- wraps the callback-based setTimeout, there is no promise-returning equivalent
  new Promise<"TIMEOUT">((resolve) => {
    setTimeout(() => {
      resolve("TIMEOUT");
    }, ms);
  });
