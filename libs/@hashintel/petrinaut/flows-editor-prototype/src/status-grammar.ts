/**
 * The status grammar (decided 10 Nov): Waiting, Running, Needs review, Done, Failed, Cancelled (runs only), Skipped
 * (steps only); a line reads mark · word · where · how many, the count naming the item with the problem.
 * `?statusgrammar=old` keeps the words from before (Completed, Abandoned, Not reached, "· 2 warnings").
 */
export const oldStatusWords =
  new URLSearchParams(globalThis.location.search).get("statusgrammar") ===
  "old";

/** A word from before the grammar, or its grammar word. */
export const statusWord = (old: string, grammar: string) =>
  oldStatusWords ? old : grammar;
