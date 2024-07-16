import slugifyLib from "@sindresorhus/slugify";

export const slugify = (text: string) =>
  /** decamelize: false for consistency with previously-used slugify library */
  slugifyLib(text, { decamelize: false });
