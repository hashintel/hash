import pluralizeLib from "pluralize";

/**
 * Turns 'By' or 'by' on its own into 'Bys' or 'bys' instead of 'Bies'/'bies'
 * This was motivated by pluralizing links such as 'Employed By', but would also work for e.g. 'Fly-by'
 *
 * 1. Capture the start of a line or non-word character (e.g. space, hyphen)
 * 2. Capture the word 'By'
 * 3. Capture the end of a line or non-word character
 * 4. Add 's' to the appropriate place among the captured text
 *
 * This could be made into a 'generatePluralRule' function to avoid repeating the pattern if more like it are needed.
 */
pluralizeLib.addPluralRule(/(^|\W)(By)(\W|$)/i, "$1$2s$3");

/**
 * 'Company' -> 'Companies', not 'Companys'
 */
pluralizeLib.addPluralRule(/any$/i, "anies");

export const pluralize = pluralizeLib;
