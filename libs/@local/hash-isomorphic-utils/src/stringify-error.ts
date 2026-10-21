import { serializeError } from "serialize-error";

const defaultStringifyErrorOptions: { prettify: boolean } = { prettify: true };

export const stringifyError = (
  // oxlint-disable-next-line typescript/no-restricted-types -- thrown/caught values are arbitrary, so the input is a genuine unknown boundary
  err: unknown,
  options: { prettify: boolean } = defaultStringifyErrorOptions,
): string =>
  JSON.stringify(serializeError(err), null, options.prettify ? 2 : undefined);
