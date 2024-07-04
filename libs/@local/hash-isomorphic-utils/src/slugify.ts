import slugifyLib from "slugify";

export const slugify = (text: string) =>
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- https://github.com/simov/slugify/issues/173
  slugifyLib(text, { lower: true, strict: true });
