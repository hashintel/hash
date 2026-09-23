//! NN-Descent k-nearest-neighbour list construction.
//!
//! [`NnDescent`] starts every row with random non-self neighbours and improves its list by local
//! joins. Each row introduces its current neighbours to each other. A distinct candidate displaces
//! a list's worst entry only when its distance is strictly smaller. Neighbours of the same row can
//! be useful candidates for one another, which motivates the join as a search heuristic. Cosine
//! similarity is not transitive, and this heuristic does not guarantee exact nearest neighbours.
//!
//! # Shape of one iteration
//!
//! 1. **Candidate sampling.** Each row splits its list by the *new* flag (set on entries that have
//!    not yet participated in a join) and samples up to
//!    [`maximum_candidates`](NnDescentOptions::maximum_candidates) of each side. Sampling marks the
//!    drawn new entries old. Old-old pairs are skipped in a local join, though the same pair can
//!    meet again through another row or sampling path.
//! 2. **Reversal.** Transposing the sampled sets lets the rows listing a row introduce it too.
//!    Sampling limits each reverse pool to the same cap so that rows which many others list cannot
//!    join quadratically in their in-degree.
//! 3. **Local join.** Every sampled new candidate of a row meets every other sampled candidate of
//!    that row, and the join offers each pair's cosine distance to both sides' lists. The cap
//!    bounds one row's join at O(cap²) distances regardless of degree skew.
//!
//! For a finite non-negative [`termination`](NnDescentOptions::termination) rate τ and L stored
//! entries, the ideal update threshold is ceil(τ · L). The computed threshold converts L to f64,
//! multiplies by τ and applies ceil in f64, then casts to u64 with saturation. Rounding can change
//! the threshold from the ceiling of the real product. A finite rate can still overflow the f64
//! product.
//!
//! Iteration stops when accepted updates are at most the computed threshold, or at
//! [`maximum_iterations`](NnDescentOptions::maximum_iterations). A low update rate measures
//! exhaustion of these sampled joins, not exact-neighbour recovery.
//!
//! # Determinism
//!
//! Initialization and every per-row draw use a generator keyed by `(seed, row, iteration)` through
//! [`keyed_rng`]. The resulting lists also depend on parallel update order: each acceptance changes
//! the threshold and membership for later offers. Converged lists need not agree between same-seed
//! runs.
//!
//! The recall spot check measures approximation quality. Structural table validation separately
//! enforces neighbour counts, domains and distance bounds. Replaying construction never substitutes
//! for either check.

use core::{
    error::Error,
    fmt,
    num::NonZero,
    sync::atomic::{Atomic, Ordering},
};
use std::sync::Mutex;

use hashql_core::id::{Id, IdSlice, IdVec};
use rand::{Rng, RngExt as _, SeedableRng, seq::IndexedRandom as _};
use rayon::{
    iter::{IndexedParallelIterator as _, IntoParallelIterator as _, ParallelIterator as _},
    slice::ParallelSliceMut as _,
};

use super::{
    Neighbour,
    construction::{KnnConstruction, NeighbourLists},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::{AlignedVecN, NonNegative},
    progress::{DescentIteration, Progress},
    random::{keyed_rng, sample_indices_vec},
};

// The candidate cap bounds one row's join work per iteration at O(cap²) distances regardless of
// degree skew; 50 matches the widths this crate constructs at, where the audited corpus converged
// to the admission floor with headroom in iterations to spare.
/// The default candidate cap per side, per row, per iteration.
const DEFAULT_MAXIMUM_CANDIDATES: usize = 50;
// The iteration cap is a backstop: convergence terminates the loop on every measured corpus first.
/// The default iteration cap.
const DEFAULT_MAXIMUM_ITERATIONS: usize = 20;
// One accepted update per thousand entries marks the join exhausted: beyond it, iterations trade
// full join sweeps for noise-level list changes.
/// The default accepted-update fraction below which the join terminates.
const DEFAULT_TERMINATION: f64 = 0.001;

/// Pinned NN-Descent sampling, convergence, and termination settings.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct NnDescentOptions {
    /// Candidates sampled per side (new and old, forward and reverse) per row per iteration.
    ///
    /// Bounds one row's join work at quadratically many distances in the cap. Larger values buy
    /// convergence quality with per-iteration cost. By default, uses 50 candidates. Zero is clamped to one.
    pub maximum_candidates: usize = DEFAULT_MAXIMUM_CANDIDATES,
    /// Iteration limit, 20 by default. Zero returns the initial random lists.
    pub maximum_iterations: usize = DEFAULT_MAXIMUM_ITERATIONS,
    /// Accepted-update rate used to stop construction, 0.001 by default.
    ///
    /// For a finite non-negative rate τ and L stored entries, the ideal update threshold is ceil(τ · L). The stopping count uses f64 count conversion, multiplication and ceil, followed by a saturating u64 cast. Rounding and overflow can change it from the ceiling of the real product. One entry can be displaced repeatedly within an iteration, making this a rate rather than a fraction bounded by one.
    pub termination: f64 = DEFAULT_TERMINATION,
}

const impl Default for NnDescentOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// A row domain that cannot be used for NN-Descent construction.
#[derive(Debug)]
pub(crate) enum NnDescentError {
    /// The corpus has at most one row.
    InsufficientRows { rows: usize },
    /// The row domain exceeds the resident lists' `u32` id encoding.
    TooManyRows { rows: usize },
}

impl fmt::Display for NnDescentError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InsufficientRows { rows } => {
                write!(fmt, "a {rows}-row corpus cannot form neighbour lists")
            }
            Self::TooManyRows { rows } => {
                write!(fmt, "{rows} rows exceed the lists' u32 id encoding")
            }
        }
    }
}

impl Error for NnDescentError {}

/// NN-Descent local-join list constructor.
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct NnDescent {
    options: NnDescentOptions,
}

impl NnDescent {
    /// Configures the candidate sampling and stopping criteria.
    pub(crate) const fn new(options: NnDescentOptions) -> Self {
        Self { options }
    }
}

/// A neighbour with its join-participation flag.
#[derive(Debug, Copy, Clone)]
struct Entry<N> {
    distance: NonNegative,
    id: N,
    new: bool,
}

/// One row's bounded neighbour list, ascending by `(distance, id)`.
///
/// Every accepted replacement strictly improves on the previous worst distance, making the live
/// worst non-increasing. The atomic mirror contains a worst value read under the lock, stored after
/// unlocking. Even when stores are reordered, that value is at least the current live worst.
/// Therefore a candidate at least as far as the mirror can be rejected without taking the lock.
///
/// The mirror is only a rejection threshold and publishes no entry data. Every candidate that
/// passes it is checked again under the mutex, which orders all entry access. Therefore relaxed
/// atomic operations suffice for this preliminary check.
#[derive(Debug)]
struct RowList<N> {
    entries: Mutex<Vec<Entry<N>>>,
    worst: Atomic<u32>,
}

impl<N> RowList<N>
where
    N: Id,
{
    /// Builds a list from its initial entries, sorted ascending by `(distance, id)`.
    ///
    /// # Panics
    ///
    /// Panics when `entries` is empty: a list always holds at least one neighbour, whose distance
    /// seeds the worst mirror.
    fn new(mut entries: Vec<Entry<N>>) -> Self {
        entries.sort_unstable_by(|lhs, rhs| {
            lhs.distance
                .cmp(&rhs.distance)
                .then_with(|| lhs.id.cmp(&rhs.id))
        });
        let worst = entries.last().expect("lists initialize non-empty").distance;

        Self {
            entries: Mutex::new(entries),
            worst: Atomic::<u32>::new(worst.to_bits()),
        }
    }

    /// Offers a candidate and reports whether it displaced the worst entry.
    ///
    /// The offer holds the lock for the containment scan and the insertion together, because
    /// membership and placement must resolve against one list state, or two concurrent offers of
    /// the same id could both pass the scan. The section under the lock is O(width) over a
    /// width-bounded list.
    fn offer(&self, id: N, distance: NonNegative) -> bool {
        if distance >= f32::from_bits(self.worst.load(Ordering::Relaxed)) {
            return false;
        }

        let mut entries = self.entries.lock().expect("a list offer cannot panic");
        let worst = entries.last().expect("lists initialize non-empty").distance;
        if distance >= worst || entries.iter().any(|entry| entry.id == id) {
            return false;
        }

        let position = entries.partition_point(|entry| (entry.distance, entry.id) < (distance, id));
        entries.pop();
        entries.insert(
            position,
            Entry {
                distance,
                id,
                new: true,
            },
        );
        let worst = entries
            .last()
            .expect("displacement preserves the width")
            .distance;
        drop(entries);

        self.worst.store(worst.to_bits(), Ordering::Relaxed);
        true
    }
}

/// Samples `count` of `pool` uniformly without replacement, taking the whole pool when it fits.
///
/// The pool is ascending afterwards on every path, allowing binary-search membership tests.
fn sample_pool<N>(pool: &mut Vec<N>, count: usize, mut rng: impl Rng)
where
    N: Id,
{
    if pool.len() > count {
        *pool = pool.sample(&mut rng, count).copied().collect();
    }

    pool.sort_unstable();
}

/// Initializes every row's list with `width` distinct random non-self rows.
///
/// Sampling draws over a domain one short and shifts past the row itself, excluding it without
/// rejection. `width` must be positive and smaller than `rows`.
///
/// # Panics
///
/// For a nonempty corpus, this panics when `width` is zero or exceeds the non-self domain.
fn initialize<N>(
    rows: usize,
    width: usize,
    seed: u64,
    distance: impl Fn(N, N) -> NonNegative + Sync,
) -> IdVec<N, RowList<N>>
where
    N: Id,
{
    (0..rows)
        .into_par_iter()
        .map(|row| {
            let row = N::from_usize(row);

            // A stream index of `u64::MAX`, which no join iteration
            // reaches, keeps the initial draw independent of every
            // iteration's draw.
            let sampled =
                sample_indices_vec(keyed_rng(seed, row.as_u64(), u64::MAX), rows - 1, width);

            RowList::new(
                sampled
                    .iter()
                    .map(|index| {
                        let index = N::from_usize(index);

                        let id = if index >= row { index.plus(1) } else { index };
                        Entry {
                            distance: distance(row, id),
                            id,
                            new: true,
                        }
                    })
                    .collect(),
            )
        })
        .collect()
}

/// Samples each row's forward candidates and retires the drawn new entries.
///
/// Splits each list by the *new* flag and samples each side to `cap`. It then clears the flag on
/// the sampled new entries. Later iterations classify these entries as old when sampling this row's
/// forward list.
fn sample_forward<N>(
    lists: &IdSlice<N, RowList<N>>,
    cap: usize,
    seed: u64,
    iteration: usize,
) -> (IdVec<N, Vec<N>>, IdVec<N, Vec<N>>)
where
    N: Id,
{
    let mut forward_new: Vec<Vec<N>> = Vec::with_capacity(lists.len());
    let mut forward_old: Vec<Vec<N>> = Vec::with_capacity(lists.len());

    lists
        .par_iter_enumerated()
        .map(|(row, list)| {
            let mut rng = keyed_rng(seed, row.as_u64(), iteration as u64);
            let mut entries = list.entries.lock().expect("a sampling pass cannot panic");

            let mut new: Vec<_> = entries
                .iter()
                .filter(|entry| entry.new)
                .map(|entry| entry.id)
                .collect();
            let mut old: Vec<_> = entries
                .iter()
                .filter(|entry| !entry.new)
                .map(|entry| entry.id)
                .collect();

            sample_pool(&mut new, cap, &mut rng);
            sample_pool(&mut old, cap, &mut rng);

            for entry in entries.iter_mut() {
                if entry.new && new.binary_search(&entry.id).is_ok() {
                    entry.new = false;
                }
            }

            drop(entries);
            (new, old)
        })
        .unzip_into_vecs(&mut forward_new, &mut forward_old);

    (IdVec::from_raw(forward_new), IdVec::from_raw(forward_old))
}

/// Transposes sampled candidate sets and limits each reverse pool.
///
/// # Panics
///
/// This panics when a target row is outside the `rows`-sized domain.
fn reverse<N>(
    forward: &IdSlice<N, Vec<N>>,
    rows: usize,
    cap: usize,
    seed: u64,
    iteration: usize,
) -> IdVec<N, Vec<N>>
where
    N: Id,
{
    // A two-pass counting transpose, sequential on purpose: a
    // bucketed par-iter (every worker scanning the full forward set,
    // keeping its own target range) is the lock-free parallel shape,
    // but it re-reads the lists once per worker, and either way the
    // pass is cap-bounded bookkeeping dwarfed by the join's distance
    // kernels. Pushing sources in ascending order leaves every pool
    // sorted and the pass deterministic.
    let mut counts = IdVec::<N, _>::from_elem(0_usize, rows);
    for targets in forward {
        for &target in targets {
            counts[target] += 1;
        }
    }

    let mut pools: IdVec<N, Vec<N>> =
        IdVec::from_fn(counts.len(), |index| Vec::with_capacity(counts[index]));

    for (source, targets) in forward.iter_enumerated() {
        for &target in targets {
            pools[target].push(source);
        }
    }

    pools
        .into_par_iter_enumerated()
        .map(|(target, mut pool)| {
            // The domain flip keeps the reverse draw independent of the
            // forward sampling pass, which keys the same (row, iteration).
            sample_pool(
                &mut pool,
                cap,
                keyed_rng(!seed, target.as_u64(), iteration as u64),
            );

            pool
        })
        .collect()
}

/// One iteration's accepted updates per stored list entry.
///
/// A join offers each pair to both sides and can displace one entry more than once. The reading is
/// a rate that can exceed `1`, and need not decrease monotonically between iterations.
#[expect(
    clippy::cast_precision_loss,
    reason = "accepted updates and stored entries deliberately convert to f64 for progress \
              reporting. The count conversions and rate division may round"
)]
fn accepted_per_entry(accepted: u64, entries: usize) -> f64 {
    accepted as f64 / entries as f64
}

impl<N> KnnConstruction<N> for NnDescent
where
    N: Id,
{
    type Error = NnDescentError;

    #[expect(
        clippy::cast_precision_loss,
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the entry count deliberately converts to f64 for rounded threshold arithmetic. \
                  The result of ceil is cast to u64 with saturation and only controls loop \
                  termination"
    )]
    fn construct<P>(
        &mut self,
        embeddings: &IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
        width: NonZero<usize>,
        mut rng: impl Rng + SeedableRng,
        progress: &P,
    ) -> Result<NeighbourLists<N>, Self::Error>
    where
        P: Progress + Sync,
    {
        let rows = embeddings.len();
        if rows < 2 {
            return Err(NnDescentError::InsufficientRows { rows });
        }
        if u32::try_from(rows - 1).is_err() {
            return Err(NnDescentError::TooManyRows { rows });
        }

        let width = width.get().min(rows - 1);
        let seed = rng.random::<u64>();
        let cap = self.options.maximum_candidates.max(1);

        // For unit vectors, cosine distance is 1 − the dot product. The trait admits l2-normalized
        // representations only, allowing this kernel to omit both norm sums. Clamping absorbs
        // unit-norm rounding at the range's ends.
        let distance = |lhs: N, rhs: N| -> NonNegative {
            let dot = embeddings[lhs].dot(&embeddings[rhs]);
            NonNegative::new_unchecked((1.0 - dot).clamp(0.0, 2.0))
        };

        let lists = initialize(rows, width, seed, distance);

        let threshold = (self.options.termination * (rows * width) as f64).ceil() as u64;

        for iteration in 0..self.options.maximum_iterations {
            let (forward_new, forward_old) = sample_forward(&lists, cap, seed, iteration);

            // Reversal: transpose the sampled sets, then cap each pool.
            let reverse_new = reverse(&forward_new, rows, cap, seed, iteration);
            let reverse_old = reverse(&forward_old, rows, cap, seed, iteration);

            // Local join: sampled new candidates meet every other sampled candidate, and the join
            // offers each distance both ways.
            let accepted = Atomic::<u64>::new(0);
            (0..rows).into_par_iter().for_each(|row| {
                let row = N::from_usize(row);

                let mut new = [forward_new[row].as_slice(), reverse_new[row].as_slice()].concat();
                new.sort_unstable();
                new.dedup();

                let mut old = [forward_old[row].as_slice(), reverse_old[row].as_slice()].concat();
                old.sort_unstable();
                old.dedup();

                let mut updates = 0;
                let mut offer = |lhs: N, rhs: N| {
                    if lhs == rhs {
                        return;
                    }

                    let separation = distance(lhs, rhs);
                    updates += u64::from(lists[lhs].offer(rhs, separation));
                    updates += u64::from(lists[rhs].offer(lhs, separation));
                };

                for (position, &lhs) in new.iter().enumerate() {
                    for &rhs in &new[position + 1..] {
                        offer(lhs, rhs);
                    }

                    for &rhs in &old {
                        offer(lhs, rhs);
                    }
                }
                accepted.fetch_add(updates, Ordering::Relaxed);
            });

            let accepted = accepted.load(Ordering::Relaxed);
            // include the terminating iteration in the observations.
            progress.descent_iteration(DescentIteration {
                iteration: iteration + 1,
                accepted_per_entry: accepted_per_entry(accepted, rows * width),
                threshold: self.options.termination,
            });

            if accepted <= threshold {
                break;
            }
        }

        let placeholder = Neighbour {
            id: N::MIN,
            distance: NonNegative::ZERO,
        };

        let mut entries = vec![placeholder; rows * width].into_boxed_slice();
        lists
            .par_iter()
            .zip(entries.par_chunks_mut(width))
            .for_each(|(list, slots)| {
                let list = list
                    .entries
                    .lock()
                    .expect("the completed join should leave the list mutex unpoisoned");

                for (slot, entry) in slots.iter_mut().zip(list.iter()) {
                    *slot = Neighbour {
                        id: entry.id,
                        distance: entry.distance,
                    };
                }
            });

        Ok(NeighbourLists::new(entries, width))
    }
}

#[cfg(test)]
mod tests {
    use core::sync::atomic::Ordering;

    use hashql_core::id::Id as _;

    use super::{Entry, RowList, sample_pool};
    use crate::{
        identity::NodeRowId,
        math::{NonNegative, non_negative},
        random::keyed_rng,
    };

    /// Builds a row list from `(distance, id)` pairs, all marked old.
    ///
    /// # Panics
    ///
    /// This panics when `pairs` is empty.
    fn list(pairs: &[(NonNegative, u32)]) -> RowList<NodeRowId> {
        RowList::new(
            pairs
                .iter()
                .map(|&(distance, id)| Entry {
                    distance,
                    id: NodeRowId::from_u32(id),
                    new: false,
                })
                .collect(),
        )
    }

    #[test]
    fn offer_displaces_the_worst_entry() {
        let row = list(&[
            (non_negative!(0.1), 7),
            (non_negative!(0.5), 3),
            (non_negative!(0.9), 11),
        ]);
        assert!(row.offer(NodeRowId::from_u32(4), non_negative!(0.3)));

        let entries = row.entries.lock().expect("the test holds the only handle");
        let ids: Vec<u64> = entries.iter().map(|entry| entry.id.as_u64()).collect();
        let accepted_is_new = entries[1].new;
        drop(entries);
        assert_eq!(ids, [7, 4, 3]);
        assert!(
            accepted_is_new,
            "an accepted entry joins the next join round"
        );
        assert_eq!(row.worst.load(Ordering::Relaxed), 0.5_f32.to_bits());
    }

    #[test]
    fn offer_rejects_duplicates_and_non_improvements() {
        let row = list(&[
            (non_negative!(0.1), 7),
            (non_negative!(0.5), 3),
            (non_negative!(0.9), 11),
        ]);
        assert!(
            !row.offer(NodeRowId::from_u32(3), non_negative!(0.2)),
            "a present id cannot enter twice"
        );
        assert!(
            !row.offer(NodeRowId::from_u32(4), non_negative!(0.9)),
            "a tie with the worst does not displace"
        );
        assert!(
            !row.offer(NodeRowId::from_u32(4), non_negative!(1.5)),
            "a worse candidate does not displace"
        );

        let entries = row.entries.lock().expect("the test holds the only handle");
        assert_eq!(entries.len(), 3);
    }

    #[test]
    fn sample_pool_sorts_every_path() {
        let mut small = vec![
            NodeRowId::from_u32(9),
            NodeRowId::from_u32(2),
            NodeRowId::from_u32(5),
        ];
        sample_pool(&mut small, 8, keyed_rng(1, 2, 3));
        assert_eq!(
            small,
            [
                NodeRowId::from_u32(2),
                NodeRowId::from_u32(5),
                NodeRowId::from_u32(9)
            ],
            "an under-cap pool is kept whole, sorted"
        );

        let mut large: Vec<NodeRowId> = (0..100).rev().map(NodeRowId::from_u32).collect();
        sample_pool(&mut large, 10, keyed_rng(1, 2, 3));
        assert_eq!(large.len(), 10);
        assert!(
            large.is_sorted(),
            "a sampled pool is sorted for the retirement scan's binary search"
        );
    }
}
