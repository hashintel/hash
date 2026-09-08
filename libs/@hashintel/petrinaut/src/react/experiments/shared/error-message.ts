/** The message of a thrown value: an Error's own, anything else stringified. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
