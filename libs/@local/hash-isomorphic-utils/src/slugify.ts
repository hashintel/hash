import slugifyLib from "slugify";

export const slugify = (text: string) =>
  // @ts-ignore -- https://github.com/simov/slugify/issues/173
  slugifyLib(text, { lower: true, strict: true });
