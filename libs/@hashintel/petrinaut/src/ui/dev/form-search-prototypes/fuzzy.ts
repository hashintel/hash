/**
 * The fuzzy matcher every form-search prototype shares: ordered-subsequence
 * matching with an fzf-style score — word starts and consecutive runs score
 * high, gaps cost, and shorter haystacks win ties — plus the matched
 * character positions so results can highlight exactly what matched.
 */

export type FuzzyMatch = {
  score: number;
  /** Indices into the haystack, ascending, one per query character. */
  positions: number[];
};

const WORD_START_BONUS = 8;
const CONSECUTIVE_BONUS = 5;
const FIRST_CHAR_BONUS = 6;
const GAP_PENALTY = 1;
const LENGTH_PENALTY = 0.1;

function isWordStart(haystack: string, index: number): boolean {
  if (index === 0) {
    return true;
  }
  const previous = haystack[index - 1]!;
  const current = haystack[index]!;
  if (/[\s_\-›./]/.test(previous)) {
    return true;
  }
  return /[a-z]/.test(previous) && /[A-Z]/.test(current);
}

/** Whether `needle` (from `at`) is a subsequence of `haystack` from `from`. */
function isSubsequenceFrom(
  needle: string,
  at: number,
  haystack: string,
  from: number,
): boolean {
  let position = from;
  for (let index = at; index < needle.length; index += 1) {
    position = haystack.indexOf(needle[index]!, position);
    if (position === -1) {
      return false;
    }
    position += 1;
  }
  return true;
}

/**
 * Matches `query` as an ordered subsequence of `haystack`,
 * case-insensitively, greedily preferring word starts. Returns `null` when
 * the query is not a subsequence. An empty query matches with score 0.
 */
export function fuzzyMatch(query: string, haystack: string): FuzzyMatch | null {
  const needle = query.toLowerCase().replaceAll(/\s+/g, "");
  if (needle.length === 0) {
    return { score: 0, positions: [] };
  }
  const lower = haystack.toLowerCase();

  // Greedy with a feasibility guard: prefer a word-start anchor only when
  // the rest of the needle still fits after it — otherwise a camelCase
  // anchor mid-word would strand the remaining characters ("breakroom"
  // must not die on BreakRoom's capital R).
  const positions: number[] = [];
  let from = 0;
  for (let at = 0; at < needle.length; at += 1) {
    const char = needle[at]!;
    let found = -1;
    for (let index = from; index < lower.length; index += 1) {
      if (
        lower[index] === char &&
        isWordStart(haystack, index) &&
        isSubsequenceFrom(needle, at + 1, lower, index + 1)
      ) {
        found = index;
        break;
      }
    }
    if (found === -1) {
      found = lower.indexOf(char, from);
    }
    if (found === -1) {
      return null;
    }
    positions.push(found);
    from = found + 1;
  }

  let score = 0;
  for (const [at, position] of positions.entries()) {
    if (position === 0) {
      score += FIRST_CHAR_BONUS;
    }
    if (isWordStart(haystack, position)) {
      score += WORD_START_BONUS;
    }
    if (at > 0) {
      const gap = position - positions[at - 1]! - 1;
      score += gap === 0 ? CONSECUTIVE_BONUS : -Math.min(gap, 6) * GAP_PENALTY;
    }
  }
  score -= haystack.length * LENGTH_PENALTY;
  return { score, positions };
}

export type RankedResult<Entry> = {
  entry: Entry;
  match: FuzzyMatch;
};

/** Ranks entries by fuzzy score against the text `textOf` extracts. */
export function rankMatches<Entry>(
  query: string,
  entries: readonly Entry[],
  textOf: (entry: Entry) => string,
  limit = 50,
): RankedResult<Entry>[] {
  const results: RankedResult<Entry>[] = [];
  for (const entry of entries) {
    const match = fuzzyMatch(query, textOf(entry));
    if (match) {
      results.push({ entry, match });
    }
  }
  results.sort((a, b) => b.match.score - a.match.score);
  return results.slice(0, limit);
}
