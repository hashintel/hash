//! First-occupant depth assignments for progressive spatial coverage.
//!
//! [`buckets`] assigns by scanning the grids coarse to fine, one rank-ordered pass per depth.
//! [`separation_buckets`] computes the same assignment at [`Depth::MAX`] in one pass over the
//! `(key, rank)` order.

use core::alloc::Allocator;
use std::alloc::Global;

use hashql_core::{
    collections::fast_hash_set,
    id::{Id, IdSlice, IdVec, bit_vec::DenseBitSet},
};

use super::rank::Ranking;
use crate::{
    math::Log2,
    morton::{Depth, MortonKey},
};

/// Assigns each point its first unclaimed grid cell's depth, capped at `deepest`.
///
/// The cascade scans depths coarse to fine. At each depth, every occupied cell that no
/// earlier-assigned point lies in receives its first still-unassigned point in rank order. The rest
/// continue deeper. Points never claiming a cell take `deepest`, the catch-all bucket. Only the
/// catch-all can hold more than one point per cell.
///
/// The assignment is a pure function of the keys, the ranking, and `deepest`. `ranking` must be a
/// valid permutation of the rows in `keys`.
///
/// # Properties
///
/// For every cut d ≤ `deepest`, points with bucket at or below d cover every occupied depth-d cell.
/// Before the catch-all cut, exactly one delivered point represents each such cell.
///
/// # Complexity
///
/// For N points and D = `deepest`, the cascade makes D + 1 rank-ordered passes and uses O(N)
/// storage. With expected constant-time hash-set operations, its time is O(N · (D + 1)).
///
/// # Panics
///
/// Panics when `keys` and `ranking.row_of_rank` disagree on the row count, or when the ranking
/// contains a row outside `keys`.
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

    // rows that no pass assigns keep `deepest`, the catch-all bucket
    let mut buckets = IdVec::<R, Depth>::from_elem(deepest, keys.len());
    let mut assigned = DenseBitSet::<R>::new_empty(keys.len());

    // The occupied cells number at most one per row, while the cell domain grows as 4ᵈ at depth d.
    // A hash set allocates for occupied cells. The row set has a linear domain and uses a dense bit
    // set.
    let mut seen = fast_hash_set();

    // Every depth-d cell lies inside exactly one cell at each shallower depth. Inductively, a point
    // assigned in a shallower cell outranks every still-unassigned point there, including those in
    // its depth-d cell. Scanning in rank order marks that cell before any unassigned point can
    // claim it. In an unmarked cell, the first visitor has its best remaining rank and establishes
    // the same invariant. Therefore one pass per depth suffices to preserve coverage and one
    // delivered representative per cell below the catch-all.
    for depth in 0..=deepest.get() {
        let depth =
            Depth::try_new(depth).expect("every depth at or below `deepest` is a valid depth");

        seen.clear();
        for &row in ranking.row_of_rank.iter() {
            let cell = keys[row].prefix(depth);
            if assigned.contains(row) {
                seen.insert(cell);
            } else if seen.insert(cell) {
                buckets[row] = depth;
                assigned.insert(row);
            } else {
                // the occupied cell leaves this row unassigned for a deeper pass
            }
        }
    }

    buckets.into_boxed_slice()
}

/// Assigns every point its natural bucket by neighbour separation.
///
/// Computes the closed form of [`buckets`] at [`Depth::MAX`]. `points` must ascend by `(key, rank)`
/// under the accessors, ranks must be pairwise distinct, and the accessors must return consistent
/// values throughout the call. Smaller ranks have higher precedence. The output follows `points`
/// order, using `alloc` for the result and `scratch` for temporary storage.
///
/// # Properties
///
/// For point i, let Dᵢ be the deepest shared grid with any better-ranked point, as measured by
/// [`MortonKey::shared_depth`]. Its bucket is min(Dᵢ + 1, 32), the first depth with no
/// better-ranked occupant, capped at the catch-all. The best-ranked point takes [`Depth::MIN`].
/// Equal keys share every grid, putting the worse-ranked point in [`Depth::MAX`]. Both this formula
/// and [`buckets`] assign every point the same bucket at the full key width.
///
/// A Morton prefix occupies a contiguous key interval. If a better-ranked point shares a prefix
/// with i, every intervening key shares it too. The nearest better-ranked point on either side
/// therefore attains the deepest shared grid on that side. It is sufficient to compare these two
/// neighbours.
///
/// # Complexity
///
/// The monotonic-stack pass takes O(N) accessor calls and comparisons for N points, plus O(N)
/// result and scratch storage. Each point enters and leaves the stack at most once. Sorting the
/// input is a separate cost.
#[must_use]
pub(crate) fn separation_buckets_in<T, P: Ord, A: Allocator, S: Allocator>(
    points: &[T],
    key: impl Fn(&T) -> MortonKey,
    rank: impl Fn(&T) -> P,
    alloc: A,
    scratch: S,
) -> Box<[Depth], A> {
    debug_assert!(
        points
            .array_windows::<2>()
            .all(|[lhs, rhs]| (key(lhs), rank(lhs)) <= (key(rhs), rank(rhs))),
        "the points must ascend by (key, rank)",
    );

    let separation =
        |left: &T, right: &T| key(left).shared_depth(key(right)).saturating_add(Log2::ONE);

    // The stack holds the points whose nearest better-ranked right neighbour is still unseen, ranks
    // ascending from bottom to top. The point that pops an entry is that neighbour, and
    // the entry below a pushed point is its nearest better-ranked left neighbour.
    let mut buckets = Vec::with_capacity_in(points.len(), alloc);
    buckets.resize(points.len(), Depth::MIN);
    let mut buckets: Box<[Depth], A> = buckets.into_boxed_slice();

    let mut stack = Vec::with_capacity_in(points.len(), scratch);

    for current in 0..points.len() {
        let current_rank = rank(&points[current]);
        while let Some(&previous) = stack.last() {
            if rank(&points[previous]) < current_rank {
                break;
            }

            stack.pop();

            let previous_depth: Depth = buckets[previous];
            buckets[previous] = previous_depth.max(separation(&points[previous], &points[current]));
        }

        if let Some(&previous) = stack.last() {
            buckets[current] = separation(&points[previous], &points[current]);
        }

        stack.push(current);
    }

    buckets
}

/// Assigns every point its natural bucket by neighbour separation.
///
/// Uses the global allocator for both output and scratch storage. Input requirements and the bucket
/// formula are those of [`separation_buckets_in`].
#[must_use]
pub(crate) fn separation_buckets<T, P: Ord>(
    points: &[T],
    key: impl Fn(&T) -> MortonKey,
    rank: impl Fn(&T) -> P,
) -> Box<[Depth]> {
    separation_buckets_in(points, key, rank, Global, Global)
}

/// A cell some published prefix fails to cover.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[cfg(any(test, feature = "bench"))]
pub(crate) struct CoverageGap {
    /// The grid depth of the uncovered cell.
    pub depth: Depth,
    /// The uncovered cell's index at that depth.
    pub cell: u64,
}

/// Checks the cascade's coverage contract over one assignment.
///
/// Checks that every occupied cell at every depth up to `deepest` has at least one point with a
/// bucket at or below that depth. This checks coverage alone, not the rank choice or representative
/// uniqueness.
///
/// # Errors
///
/// Returns a [`CoverageGap`] at the shallowest failing depth, for the first uncovered cell
/// encountered in key-column order.
///
/// # Panics
///
/// Panics when `keys` and `buckets` disagree on the row count.
#[cfg(any(test, feature = "bench"))]
#[expect(
    clippy::panic_in_result_fn,
    reason = "mismatched row counts violate the assignment's input contract"
)]
pub(crate) fn verify_coverage<R: Id>(
    keys: &IdSlice<R, MortonKey>,
    buckets: &IdSlice<R, Depth>,
    deepest: Depth,
) -> Result<(), CoverageGap> {
    use std::collections::HashSet;

    assert_eq!(
        keys.len(),
        buckets.len(),
        "the keys and the buckets must cover the same rows",
    );

    let mut covered = HashSet::new();
    for depth in 0..=deepest.get() {
        let depth =
            Depth::try_new(depth).expect("every depth at or below `deepest` is a valid depth");

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
