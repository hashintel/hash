import slugify from "slugify";

/** Slugify the title of a type */
export const slugifyTypeTitle = (title: string): string =>
  slugify(title, { lower: true });
