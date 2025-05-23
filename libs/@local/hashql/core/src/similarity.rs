use alloc::collections::BinaryHeap;
use core::{cmp, cmp::Reverse};

use rapidfuzz::distance::{damerau_levenshtein, postfix, prefix};
use unicase::UniCase;

use crate::symbol::Symbol;

const EDIT_WEIGHT: f64 = 0.45;
const PREFIX_WEIGHT: f64 = 0.30;
const POSTFIX_WEIGHT: f64 = 0.25;

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
        self.score.total_cmp(&other.score)
    }
}

#[expect(clippy::float_arithmetic, clippy::cast_precision_loss)]
fn edit_distance<'heap>(
    lookup: Symbol<'heap>,
    candidates: impl IntoIterator<Item: AsRef<Symbol<'heap>>>,
    top_n: Option<usize>,
    cutoff: Option<f64>,
) -> impl IntoIterator<Item = Symbol<'heap>> {
    // Having the cutoff be at least 3 makes typos more forgiving for smaller strings
    let len = lookup.as_str().len().max(1) as f64;
    let cutoff = cutoff
        .unwrap_or_else(|| 1.0 - (f64::max(3_f64, len / 3_f64) / len))
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
        // first sort the results
        case_insensitive.sort_unstable();
        return case_insensitive;
    }

    let edit_distance: Vec<_> = edit_distance(lookup, candidates.clone(), top_n, cutoff)
        .into_iter()
        .collect();

    if !edit_distance.is_empty() {
        return edit_distance;
    }

    let mut symbols: Vec<_> = candidates
        .into_iter()
        .map(|symbol| *symbol.as_ref())
        .collect();
    symbols.sort_unstable();

    if let Some(top_n) = top_n {
        symbols.truncate(top_n);
    }

    symbols
}
