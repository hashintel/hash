/**
 * Sleep function
 *
 * Same sleep function as in 'libs/@local/hash-isomorphic-utils/src/sleep.ts', copied here to sever transient dependency on API from backend-utils
 * @param ms time in milliseconds to sleep for
 * @returns promise that resolves after ms time
 */
export const sleep = (ms: number) =>
  new Promise<"TIMEOUT">((resolve) => {
    setTimeout(() => resolve("TIMEOUT"), ms);
  });
