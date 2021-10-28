/** Wait for `ms` milliseconds. */
export const waitFor = (ms: number) =>
  new Promise<"TIMEOUT">((resolve) => setTimeout(() => resolve("TIMEOUT"), ms));
