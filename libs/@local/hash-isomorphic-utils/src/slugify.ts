import slugifyLibrary from "@sindresorhus/slugify";

export const slugify = (text: string) =>
  /** Decamelize: false for consistency with previously-used slugify library */
  slugifyLibrary(text, { decamelize: false });
