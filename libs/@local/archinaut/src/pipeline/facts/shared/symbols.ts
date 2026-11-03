/** How the providers name what a file defines and references. */

/** The id of a module as a whole, which bare and dynamic imports reference. */
export const moduleSymbol = (file: string): string => `${file}#`;
