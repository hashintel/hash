//! The first-occupant cascade, which gives every point a minimum-zoom bucket.

use std::collections::HashSet;

use hashql_core::{
    collections::fast_hash_set,
    id::{Id, IdSlice, IdVec, bit_vec::DenseBitSet},
};

use super::rank::Ranking;
use crate::morton::{Depth, MortonKey};

/// Assigns every point its bucket.
///
/// The bucket is the shallowest grid depth at which the point first occupies its cell.
///
/// The cascade scans depths coarse to fine. At each depth, every occupied cell that no
/// earlier-assigned point lies in receives its first still-unassigned point in rank order; the rest
/// continue deeper. Points never claiming a cell - co-located within one deepest-grid cell - take
/// `deepest`, the catch-all bucket, so `deepest` is the one bucket holding more than one point per
/// cell.
///
/// Delivering every point with a bucket at or below a cut depth therefore covers every occupied
/// cell of the cut's grid. [`verify_coverage`] rechecks that claim for one generation.
///
/// The assignment is a pure function of the keys, the ranking, and `deepest`, over whatever row
/// domain `R` the two agree on.
///
/// # Panics
///
/// This panics when `keys` and `ranking` disagree on the row count.
#[must_use]
pub(crate) fn buckets<R: Id>(
    keys: &IdSlice<R, MortonKey>,
    ranking: &Ranking<R>,
    deepest: Depth,
) -> Box<IdSlice<R, Depth>> {
    assert_eq!(
        keys.len(),
        ranking.row_of_rank.len(),
        "the keys and the ranking must cover the same rows",
    );

    // Rows that no pass assigns keep `deepest`, the catch-all bucket.
    let mut buckets = IdVec::<R, Depth>::from_elem(deepest, keys.len());
    let mut assigned = DenseBitSet::<R>::new_empty(keys.len());

    // A hash set holds the cells. Its elements are `prefix(depth)` keys, and their `4^depth`-cell
    // domain outgrows the row count from depth ~10 on while the populated cells stay bounded by the
    // rows, so the hash set pays only for the cells the cascade touches. The row set fills a linear
    // domain, which a dense bit set fits.
    let mut seen = fast_hash_set();

    // One rank-ordered pass per depth suffices with a single cell set. Within any cell an
    // assigned point always outranks every still-unassigned point, because every point of the
    // current cell sat inside the shallower cell it claimed and lost that claim on rank. An
    // assigned point therefore marks its cell before any unassigned visitor arrives. The first
    // unassigned visitor of an unmarked cell holds the cell's best still-unassigned rank.
    for depth in 0..=deepest.get() {
        let depth = Depth::new(depth).expect("every depth at or below `deepest` is a valid depth");

        seen.clear();
        for &row in ranking.row_of_rank.iter() {
            let cell = keys[row].prefix(depth);
            if assigned.contains(row) {
                seen.insert(cell);
            } else if seen.insert(cell) {
                buckets[row] = depth;
                assigned.insert(row);
            } else {
                // The cell is already claimed at this depth; the row
                // stays unassigned for a deeper pass.
            }
        }
    }

    buckets.into_boxed_slice()
}

/// A cell some published prefix fails to cover.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct CoverageGap {
    /// The grid depth of the uncovered cell.
    pub depth: Depth,
    /// The uncovered cell's index at that depth.
    pub cell: u64,
}

/// Checks the cascade's coverage contract over one assignment.
///
/// For every depth up to `deepest` and every occupied cell of that depth's grid, at least one point
/// of the cell carries a bucket at or below the depth; delivering the buckets-at-or-below-cut
/// prefix then shows every occupied cell. The cascade guarantees this by construction - the check
/// is the publishable evidence, not a consumer's obligation.
///
/// # Panics
///
/// This panics when `keys` and `buckets` disagree on the row count.
#[expect(
    clippy::panic_in_result_fn,
    reason = "mismatched row counts are a programmer error, not a coverage gap"
)]
pub(crate) fn verify_coverage<R: Id>(
    keys: &IdSlice<R, MortonKey>,
    buckets: &IdSlice<R, Depth>,
    deepest: Depth,
) -> Result<(), CoverageGap> {
    assert_eq!(
        keys.len(),
        buckets.len(),
        "the keys and the buckets must cover the same rows",
    );

    let mut covered = HashSet::new();
    for depth in 0..=deepest.get() {
        let depth = Depth::new(depth).expect("every depth at or below `deepest` is a valid depth");

        covered.clear();
        covered.extend(
            keys.iter()
                .zip(buckets.iter())
                .filter(|&(_, bucket)| *bucket <= depth)
                .map(|(key, _)| key.prefix(depth)),
        );

        for key in keys {
            let cell = key.prefix(depth);
            if !covered.contains(&cell) {
                return Err(CoverageGap { depth, cell });
            }
        }
    }

    Ok(())
}
