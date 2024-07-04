import slugifyLib from "slugify";

const slugifyFn = slugifyLib as unknown as typeof slugifyLib.default;

export const slugify = (text: string) =>
  slugifyFn(text, { lower: true, strict: true });
