/**
 * Checks if a given string is exactly a non-negative integer.
 *
 * For example, it will accept strings such as:
 * - "0"
 * - "1"
 * - "94818981"
 *
 * And it will not accept strings such as:
 * - "0.0"
 * - "1.0"
 * - "-1"
 * - "foo"
 * - "0foo"
 * - "1.1"
 *
 * @param {string} input
 */
export const stringIsNonNegativeInteger = (
  input: string,
): input is `${number}` => {
  const asInteger = Number.parseInt(input, 10);
  return asInteger.toString() === input && asInteger >= 0;
};
