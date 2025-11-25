use alloc::{alloc::Global, collections::BinaryHeap};
use core::{cmp, cmp::Reverse};

use rapidfuzz::distance::{damerau_levenshtein, postfix, prefix};
use unicase::UniCase;
use unicode_segmentation::UnicodeSegmentation as _;

use crate::{collections::FastHashSet, symbol::Symbol};

struct Similarity<'heap> {
    score: f64,
    symbol: Symbol<'heap>,
}

impl PartialEq for Similarity<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.score == other.score
    }
}

impl Eq for Similarity<'_> {}

impl PartialOrd for Similarity<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Similarity<'_> {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        // Taking the symbol into account here means that the order is deterministic irrespective of
        // insertion order.
        self.score
            .total_cmp(&other.score)
            .then_with(|| self.symbol.cmp(&other.symbol))
    }
}

const EDIT_WEIGHT: f64 = 0.45;
const PREFIX_WEIGHT: f64 = 0.30;
const POSTFIX_WEIGHT: f64 = 0.25;

const CUTOFF_THRESHOLD: f64 = 3_f64;
const TRANSITION_POINT: f64 = 3_f64;

/// Calculate the cutoff score for a given string length.
///
/// See <https://www.desmos.com/calculator/gogpbccxdw> for the formula used to calculate the cutoff score.
#[expect(
    clippy::float_arithmetic,
    clippy::cast_precision_loss,
    clippy::min_ident_chars,
    reason = "mathematical formula"
)]
const fn calculate_cutoff(length: usize) -> f64 {
    let x = f64::max(length as f64, 1_f64);
    let p = 1_f64 - 1_f64 / CUTOFF_THRESHOLD;
    let t = TRANSITION_POINT;

    (p / (1_f64 - 1_f64 / t)) * (1_f64 - (f64::max(x, t) / (t * x)))
}

#[expect(clippy::float_arithmetic)]
fn edit_distance<'heap>(
    lookup: Symbol<'heap>,
    candidates: impl IntoIterator<Item: AsRef<Symbol<'heap>>>,
    top_n: Option<usize>,
    cutoff: Option<f64>,
) -> impl IntoIterator<Item = Symbol<'heap>> {
    let cutoff = cutoff
        .unwrap_or_else(|| calculate_cutoff(lookup.as_str().len()))
        .clamp(0_f64, 1_f64);

    let candidates = candidates.into_iter();

    // This is a min-heap
    let mut heap = BinaryHeap::with_capacity(
        // We add `+ 1` because we always have one extra element in the heap when we push but there
        // isn't enough space
        top_n.map_or_else(|| candidates.size_hint().0, |top_n| top_n + 1),
    );

    let prefix = prefix::BatchComparator::new(lookup.as_str().chars());
    let postfix = postfix::BatchComparator::new(lookup.as_str().chars());

    let edit = damerau_levenshtein::BatchComparator::new(lookup.as_str().chars());
    let edit_args = damerau_levenshtein::Args::default().score_cutoff(cutoff);

    for symbol in candidates {
        let symbol = *symbol.as_ref();
        let candidate = symbol.as_str();

        let Some(edit_weight) = edit.normalized_similarity_with_args(candidate.chars(), &edit_args)
        else {
            continue;
        };

        let prefix_weight = prefix.normalized_similarity(candidate.chars());
        let postfix_weight = postfix.normalized_similarity(candidate.chars());

        let score = edit_weight.mul_add(
            EDIT_WEIGHT,
            prefix_weight.mul_add(PREFIX_WEIGHT, postfix_weight * POSTFIX_WEIGHT),
        );

        heap.push(Reverse(Similarity { score, symbol }));

        if let Some(top_n) = top_n
            && heap.len() > top_n
        {
            heap.pop();
        }
    }

    heap.into_iter_sorted()
        .map(|Reverse(Similarity { score: _, symbol })| symbol)
}

// The more correct way would be to implement UTS#55 instead (https://www.unicode.org/reports/tr55/#Identifier-Chunks)
// but there is no crate that does this and this gets us there pretty close (although
// `CamelBoundary` and `HATBoundary`) are not respected.
// There's also no implementation that actually supports this properly. Either the implementation
// has it's implementation private (heck) or has poor execution (case-convert).
fn split_words(input: &str) -> impl Iterator<Item = UniCase<&str>> {
    input
        .unicode_words()
        .flat_map(|value| value.split('_'))
        .filter(|word| !word.is_empty())
        .map(UniCase::new)
}

#[expect(clippy::float_arithmetic, clippy::cast_precision_loss)]
fn sorted_word_match<'heap>(
    lookup: Symbol<'heap>,
    candidates: impl IntoIterator<Item: AsRef<Symbol<'heap>>> + Clone,
    top_n: Option<usize>,
) -> impl IntoIterator<Item = Symbol<'heap>> {
    let candidates = candidates.into_iter();

    let words: FastHashSet<_> = split_words(lookup.unwrap()).collect();
    let words_len = words.len() as f64;

    let mut heap = BinaryHeap::with_capacity(
        top_n.map_or_else(|| candidates.size_hint().0, |top_n| top_n + 1),
    );

    let mut candidate = FastHashSet::<_, Global>::default();
    for symbol in candidates {
        let &symbol = symbol.as_ref();
        candidate.extend(split_words(symbol.unwrap()));

        let common = words.intersection(&candidate).count();

        if common == 0 {
            candidate.clear();
            continue;
        }

        heap.push(Reverse(Similarity {
            score: common as f64 / words_len,
            symbol,
        }));

        if let Some(top_n) = top_n
            && heap.len() > top_n
        {
            heap.pop();
        }

        candidate.clear();
    }

    heap.into_iter_sorted()
        .map(|Reverse(Similarity { score: _, symbol })| symbol)
}

/// Finds the most similar symbols to a lookup string from a set of candidates.
///
/// This function implements a three-tier matching strategy with fallback priority:
/// 1. **Case-insensitive exact matches** - Returns all exact matches ignoring case
/// 2. **Edit distance matching** - Uses weighted combination of Damerau-Levenshtein distance,
///    prefix similarity, and postfix similarity with configurable cutoff thresholds
/// 3. **Word-based matching** - Falls back to Unicode word intersection scoring
///
/// The edit distance matching uses an adaptive cutoff based on string length that becomes
/// more permissive for shorter strings (where typos are more impactful) and more restrictive
/// for longer identifiers. See `calculate_cutoff` for the mathematical formula.
///
/// # Arguments
///
/// * `lookup` - The symbol to find suggestions for
/// * `candidates` - An iterable collection of potential matches. Must be cloneable as it may be
///   iterated multiple times for different matching strategies
/// * `top_n` - Optional limit on the number of results returned. If `None`, returns all matches
///   above the similarity threshold
/// * `cutoff` - Optional custom similarity threshold (0.0 to 1.0). If `None`, uses an adaptive
///   cutoff calculated based on the lookup string length
///
/// Returns a vector of the most similar symbols, sorted by similarity score (best matches first).
/// The vector will be empty if no sufficiently similar candidates are found.
///
/// # Examples
///
/// ```
/// use hashql_core::{algorithms::did_you_mean, heap::Heap, symbol::Symbol};
///
/// let heap = Heap::new();
///
/// // Case-insensitive exact match (highest priority)
/// let lookup = heap.intern_symbol("Hello");
/// let candidates = [heap.intern_symbol("hello"), heap.intern_symbol("world")];
/// let matches = did_you_mean(lookup, &candidates, None, None);
/// assert_eq!(matches[0].as_str(), "hello");
///
/// // Edit distance matching for typos
/// let lookup = heap.intern_symbol("tset");
/// let candidates = [
///     heap.intern_symbol("test"),
///     heap.intern_symbol("rest"),
///     heap.intern_symbol("best"),
/// ];
/// let matches = did_you_mean(lookup, &candidates, Some(2), None);
/// assert_eq!(matches.len(), 1);
/// assert_eq!(matches[0].as_str(), "test"); // Best match for "tset"
///
/// // Word-based matching for compound identifiers
/// let lookup = heap.intern_symbol("user name");
/// let candidates = [
///     heap.intern_symbol("username_field"),
///     heap.intern_symbol("user_data"),
///     heap.intern_symbol("profile_info"),
/// ];
/// let matches = did_you_mean(lookup, &candidates, None, None);
/// // Will match "user_data" due to word overlap
/// assert_eq!(matches.len(), 1);
/// assert_eq!(matches[0].as_str(), "user_data");
/// ```
pub fn did_you_mean<'heap>(
    lookup: Symbol<'heap>,
    candidates: impl IntoIterator<Item: AsRef<Symbol<'heap>>> + Clone,
    top_n: Option<usize>,
    cutoff: Option<f64>,
) -> Vec<Symbol<'heap>> {
    let lookup_unicase = UniCase::new(lookup.as_str());

    // Priority of matches:
    // 1. Exact case-insensitive match
    // 2. Edit Distance Match
    // 3. Sorted Word Match
    let mut case_insensitive: Vec<_> = candidates
        .clone()
        .into_iter()
        .filter(|candidate| UniCase::new(candidate.as_ref().as_str()) == lookup_unicase)
        .map(|candidate| *candidate.as_ref())
        .collect();

    if !case_insensitive.is_empty() {
        // Case insensitive matches are sorted, as to stay consistent
        case_insensitive.sort_unstable();
        return case_insensitive;
    }

    let similar: Vec<_> = edit_distance(lookup, candidates.clone(), top_n, cutoff)
        .into_iter()
        .collect();

    if !similar.is_empty() {
        return similar;
    }

    sorted_word_match(lookup, candidates, top_n)
        .into_iter()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{heap::Heap, symbol::Symbol};

    /// Helper function to create symbols from string literals for testing
    fn collect_symbols(
        heap: &Heap,
        strings: impl IntoIterator<Item: AsRef<str>>,
    ) -> Vec<Symbol<'_>> {
        strings
            .into_iter()
            .map(|value| heap.intern_symbol(value.as_ref()))
            .collect()
    }

    /// Helper function to extract string representations from symbol results
    fn collect_strings<'heap>(
        symbols: impl IntoIterator<Item: AsRef<Symbol<'heap>>>,
    ) -> Vec<&'heap str> {
        symbols
            .into_iter()
            .map(|symbol| symbol.as_ref().unwrap())
            .collect()
    }

    #[test]
    fn case_insensitive_exact_match_priority() {
        let heap = Heap::new();

        let lookup = heap.intern_symbol("Hello");
        let candidates = collect_symbols(&heap, &["hello", "HELLO", "helo", "world"]);

        let matches = did_you_mean(lookup, &candidates, None, None);

        assert_eq!(collect_strings(&matches), ["HELLO", "hello"]);
    }

    #[test]
    fn edit_distance_matching() {
        let heap = Heap::new();

        let lookup = heap.intern_symbol("test");
        let candidates = collect_symbols(
            &heap,
            &[
                "tset",  // 2 swaps
                "rest",  // 1 substitution
                "tests", // 1 insertion
                "est",   // 1 deletion
                "best",  // 1 substitution
                "xyz",   // No similarity
            ],
        );

        let matches = did_you_mean(lookup, &candidates, None, None);
        let matches = collect_strings(&matches);

        assert!(!matches.is_empty(), "should find similar words");
        assert!(
            !matches.contains(&"xyz"),
            "should reject dissimilar words like 'xyz'"
        );
        assert!(
            matches.contains(&"tset"),
            "should find transposed characters"
        );
    }

    #[test]
    fn top_n_limiting() {
        let heap = Heap::new();

        let lookup = heap.intern_symbol("test");
        let candidates = collect_symbols(&heap, &["tset", "rest", "tests", "est", "best"]);

        let matches = did_you_mean(lookup, &candidates, Some(2), None);

        assert!(matches.len() <= 2, "should return at most 2 results");
        assert!(!matches.is_empty(), "should find at least some matches");
    }

    #[test]
    fn custom_cutoff() {
        let heap = Heap::new();
        let lookup = heap.intern_symbol("test");
        let candidates = collect_symbols(&heap, &["tset", "xyz"]);

        let strict_matches = did_you_mean(lookup, &candidates, None, Some(0.9));
        assert!(
            strict_matches.is_empty() || strict_matches.len() <= 1,
            "should reject weak matches with strict cutoff"
        );

        let permissive_matches = did_you_mean(lookup, &candidates, None, Some(0.1));
        assert!(
            !permissive_matches.is_empty(),
            "should accept more matches with permissive cutoff"
        );
    }

    #[test]
    fn word_based_matching_fallback() {
        let heap = Heap::new();
        let lookup = heap.intern_symbol("user name");
        let candidates = collect_symbols(
            &heap,
            &[
                "username_field", /* Contains both "user" and "name" concepts, but not
                                   * separately, therefore discarded */
                "user_data",      // Contains "user"
                "profile_info",   // No word overlap
                "name_validator", // Contains "name"
            ],
        );

        let matches = did_you_mean(lookup, &candidates, None, Some(1.0));
        let matches = collect_strings(&matches);

        assert!(!matches.is_empty());

        assert!(matches.contains(&"user_data"));
        assert!(matches.contains(&"name_validator"));
    }

    #[test]
    fn empty_candidates() {
        let heap = Heap::new();
        let lookup = heap.intern_symbol("test");

        let matches = did_you_mean(lookup, core::iter::empty::<Symbol<'_>>(), None, None);
        assert!(matches.is_empty());
    }

    #[test]
    fn no_matches_found() {
        let heap = Heap::new();
        let lookup = heap.intern_symbol("test");
        let candidates = collect_symbols(&heap, &["xyz", "abc", "123"]);

        let matches = did_you_mean(lookup, &candidates, None, None);
        assert!(matches.is_empty());
    }

    #[test]
    fn single_character_strings() {
        let heap = Heap::new();
        let lookup = heap.intern_symbol("i");
        let candidates = collect_symbols(&heap, &["I", "a", "o", "if", "in"]);

        let matches = did_you_mean(lookup, &candidates, None, None);
        let matches = collect_strings(&matches);

        assert_eq!(matches, ["I"]);
    }

    #[test]
    fn mixed_length_candidates() {
        let heap = Heap::new();

        let lookup = heap.intern_symbol("fn");
        let candidates = collect_symbols(
            &heap,
            &["function", "func", "f", "fn_call", "main_fn", "FN"],
        );

        let matches = did_you_mean(lookup, &candidates, None, None);
        let matches = collect_strings(&matches);

        assert_eq!(
            matches,
            ["FN"],
            "should prioritize case-insensitive exact match first"
        );
    }

    #[test]
    fn deterministic_results() {
        let heap = Heap::new();
        let lookup = heap.intern_symbol("test");
        let mut candidates = collect_symbols(&heap, &["tset", "rest", "best", "west"]);

        let first_run_matches = did_you_mean(lookup, &candidates, None, None);

        // shuffle the candidates around (just rotate a bit)
        candidates.rotate_left(3);

        let second_run_matches = did_you_mean(lookup, &candidates, None, None);

        assert_eq!(
            first_run_matches.len(),
            second_run_matches.len(),
            "should produce consistent result count"
        );
        for (first_match, second_match) in first_run_matches.iter().zip(second_run_matches.iter()) {
            assert_eq!(
                first_match.as_str(),
                second_match.as_str(),
                "should produce identical results across multiple runs"
            );
        }
    }
}
