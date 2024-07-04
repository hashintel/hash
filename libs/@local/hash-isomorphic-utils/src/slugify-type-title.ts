import { slugify } from "./slugify.js";

/** Slugify the title of a type */
export const slugifyTypeTitle = (title: string): string => slugify(title);
