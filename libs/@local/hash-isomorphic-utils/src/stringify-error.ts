import { serializeError } from "serialize-error";

export const stringifyError = (
  err: unknown,
  options: { prettify: boolean } = { prettify: true },
) => {
  return JSON.stringify(
    serializeError(err),
    null,
    options.prettify ? 2 : undefined,
  );
};
