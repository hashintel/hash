/**
 * What both TypeScript walkers agree on: how a symbol and a module are
 * named, which files count as repository source, and how occurrences are
 * collected without duplicates.
 */

import type { SymbolOccurrence } from "../../facts";

/** The id of a module as a whole, which bare and dynamic imports reference. */
export const moduleSymbol = (file: string): string => `${file}#`;

/** Inside the repository and not an installed dependency. */
export const isRepositorySource = (file: string): boolean =>
  !file.startsWith("..") &&
  !file.startsWith("node_modules/") &&
  !file.includes("/node_modules/");

export interface OccurrenceRecorder {
  (symbol: string, definition: boolean): void;
  occurrences: SymbolOccurrence[];
}

export const occurrenceRecorder = (): OccurrenceRecorder => {
  const seen = new Set<string>();
  const occurrences: SymbolOccurrence[] = [];
  const record = ((symbol: string, definition: boolean): void => {
    const key = `${symbol}|${definition}`;
    if (!seen.has(key)) {
      seen.add(key);
      occurrences.push({ symbol, definition });
    }
  }) as OccurrenceRecorder;
  record.occurrences = occurrences;
  return record;
};
