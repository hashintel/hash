//! The first-occupant cascade: a minimum-zoom bucket per point.

use std::collections::HashSet;

use super::rank::Ranking;
use crate::morton::{Depth, MortonKey};

/// Assigns every point its bucket: the shallowest grid depth at which
/// the point is its cell's first occupant.
///
/// The cascade scans depths coarse to fine. At each depth, every
/// occupied cell that no earlier-assigned point lies in receives its
/// first still-unassigned point in rank order; the rest continue
/// deeper. Points never claiming a cell - co-located within one
/// deepest-grid cell - take `deepest`, the catch-all bucket, so
/// `deepest` is the one bucket holding more than one point per cell.
///
/// Delivering every point with a bucket at or below a cut depth
/// therefore covers every occupied cell of the cut's grid; the claim is
/// checkable per generation with [`verify_coverage`].
///
/// The assignment is a pure function of the keys, the ranking, and
/// `deepest`.
///
/// # Panics
///
/// Panics when `keys` and `ranking` disagree on the row count.
#[must_use]
pub(crate) fn buckets(keys: &[MortonKey], ranking: &Ranking, deepest: Depth) -> Box<[Depth]> {
    assert_eq!(
        keys.len(),
        ranking.row_of_rank.len(),
        "the keys and the ranking must cover the same rows",
    );

    // The catch-all initialization: rows no pass assigns keep `deepest`.
    let mut buckets = vec![deepest; keys.len()];
    let mut unassigned: Vec<u32> = ranking.row_of_rank.to_vec();
    let mut assigned: Vec<u32> = Vec::new();

    let mut represented = HashSet::new();
    let mut claimed = HashSet::new();

    for depth in 0..=deepest.get() {
        let depth = Depth::new(depth).expect("every depth at or below `deepest` is a valid depth");

        represented.clear();
        represented.extend(assigned.iter().map(|&row| keys[row as usize].prefix(depth)));
        claimed.clear();

        unassigned.retain(|&row| {
            let cell = keys[row as usize].prefix(depth);
            if represented.contains(&cell) || !claimed.insert(cell) {
                return true;
            }

            buckets[row as usize] = depth;
            assigned.push(row);
            false
        });
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
/// For every depth up to `deepest` and every occupied cell of that
/// depth's grid, at least one point of the cell carries a bucket at or
/// below the depth; delivering the buckets-at-or-below-cut prefix then
/// shows every occupied cell. The cascade guarantees this by
/// construction - the check is the publishable evidence, not a
/// consumer's obligation.
///
/// # Panics
///
/// Panics when `keys` and `buckets` disagree on the row count.
#[expect(
    clippy::panic_in_result_fn,
    reason = "mismatched row counts are a programmer error, not a coverage gap"
)]
pub(crate) fn verify_coverage(
    keys: &[MortonKey],
    buckets: &[Depth],
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
                .zip(buckets)
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
