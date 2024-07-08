import slugifyLib from "slugify";

/** @see https://github.com/simov/slugify/issues/173 */
const slugifyFn = slugifyLib as unknown as typeof slugifyLib.default;

export const slugify = (text: string) =>
  slugifyFn(text, { lower: true, strict: true });
