//! NN-Descent k-nearest-neighbour list construction.
//!
//! [`NnDescent`] derives every row's neighbour list directly, without a search structure: lists
//! start random and improve by local joins — each row introduces its current neighbours to each
//! other, and every introduction that beats a list's worst entry displaces it. The join converges
//! because a neighbour of a neighbour is likely a neighbour; the audited cost on generic-similarity
//! corpora is far below the brute-force quadratic.
//!
//! # Shape of one iteration
//!
//! 1. **Candidate sampling.** Each row splits its list by the *new* flag — set on entries that have
//!    not yet participated in a join — and samples up to
//!    [`maximum_candidates`](NnDescentOptions::maximum_candidates) of each side. Sampled new
//!    entries are marked old: without the flag protocol, every iteration would recompare the same
//!    pairs.
//! 2. **Reversal.** The sampled sets are transposed, so a row is also introduced by the rows that
//!    list it. Reverse pools are sampled to the same cap: without the cap, rows that many others
//!    list would join quadratically in their in-degree.
//! 3. **Local join.** Per row, every sampled new candidate meets every other sampled candidate;
//!    each pair's cosine distance is offered to both sides' lists.
//!
//! Iteration stops when an iteration's accepted updates fall to
//! [`termination`](NnDescentOptions::termination) of the total entry count, or at
//! [`maximum_iterations`](NnDescentOptions::maximum_iterations).
//!
//! # Determinism
//!
//! Sampling streams derive from the seed alone: initialization and every per-row draw use a
//! generator keyed by `(seed, row, iteration)`. Update application is parallel and unordered,
//! however, and a list's acceptances depend on the updates applied before it, so converged lists
//! can differ between same-seed runs. The search backends share this property (their parallel
//! linking is unordered the same way); the recall spot check downstream is the arbiter of every
//! construction, and the persisted table's contract is carried by that check, never by replaying
//! the construction.

use core::{
    error::Error,
    fmt,
    num::NonZero,
    sync::atomic::{AtomicU32, AtomicU64, AtomicUsize, Ordering},
};
use std::sync::Mutex;

use rand::{Rng, RngExt as _, SeedableRng};
use rand_xoshiro::Xoshiro256PlusPlus;
use rayon::{
    iter::{
        IndexedParallelIterator as _, IntoParallelIterator as _, IntoParallelRefIterator as _,
        ParallelIterator as _,
    },
    slice::ParallelSliceMut as _,
};

use super::{
    Neighbour,
    construction::{KnnConstruction, NeighbourLists},
};
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    math::AlignedVecN,
    random::sample_indices_vec,
};

// The candidate cap bounds one row's join work per iteration at O(cap^2) distances regardless of
// degree skew; 50 matches the widths this crate constructs at, where the audited corpus converged
// to the admission floor with headroom in iterations to spare.
const DEFAULT_MAXIMUM_CANDIDATES: usize = 50;
// The iteration cap is a backstop: convergence terminates the loop on every measured corpus first.
const DEFAULT_MAXIMUM_ITERATIONS: usize = 20;
// One accepted update per thousand entries marks the join exhausted: beyond it, iterations trade
// full join sweeps for noise-level list changes.
const DEFAULT_TERMINATION: f64 = 0.001;

/// Pinned NN-Descent sampling, convergence, and termination settings.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct NnDescentOptions {
    /// Candidates sampled per side (new and old, forward and reverse) per row per iteration.
    ///
    /// Bounds one row's join work at quadratically many distances in the cap. Larger values buy
    /// convergence quality with per-iteration cost.
    pub maximum_candidates: usize = DEFAULT_MAXIMUM_CANDIDATES,
    /// Iterations after which construction stops regardless of convergence.
    pub maximum_iterations: usize = DEFAULT_MAXIMUM_ITERATIONS,
    /// The accepted-update fraction of the total entry count below which the join is converged.
    pub termination: f64 = DEFAULT_TERMINATION,
}

const impl Default for NnDescentOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// The NN-Descent construction failed.
#[derive(Debug)]
pub(crate) enum NnDescentError {
    /// The corpus holds fewer than two rows.
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
    /// Wraps pinned options.
    pub(crate) const fn new(options: NnDescentOptions) -> Self {
        Self { options }
    }
}

/// One resident list entry: a neighbour and its join-participation flag.
#[derive(Debug, Copy, Clone)]
struct Entry {
    distance: f32,
    id: u32,
    new: bool,
}

/// One row's bounded neighbour list, ascending by `(distance, id)`.
///
/// The worst distance is mirrored into an atomic beside the lock so offers can reject without
/// contending: the mirrored value only decreases, so a stale read is never below the live worst
/// and a rejection against it is always sound.
#[derive(Debug)]
struct RowList {
    entries: Mutex<Vec<Entry>>,
    worst: AtomicU32,
}

impl RowList {
    fn new(mut entries: Vec<Entry>) -> Self {
        entries.sort_unstable_by(|lhs, rhs| {
            lhs.distance
                .total_cmp(&rhs.distance)
                .then_with(|| lhs.id.cmp(&rhs.id))
        });
        let worst = entries.last().expect("lists initialize non-empty").distance;
        Self {
            entries: Mutex::new(entries),
            worst: AtomicU32::new(worst.to_bits()),
        }
    }

    /// Offers a candidate; returns whether it displaced an entry.
    fn offer(&self, id: u32, distance: f32) -> bool {
        if distance >= f32::from_bits(self.worst.load(Ordering::Relaxed)) {
            return false;
        }

        let mut entries = self.entries.lock().expect("a list offer cannot panic");
        let last = entries.len() - 1;
        if distance >= entries[last].distance {
            return false;
        }
        if entries.iter().any(|entry| entry.id == id) {
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
        self.worst
            .store(entries[last].distance.to_bits(), Ordering::Relaxed);
        true
    }
}

/// A generator keyed by the construction seed, a row, and an iteration.
///
/// `SplitMix64` finalization scrambles the key so per-row streams are independent; initialization
/// uses the row alone with an iteration of `usize::MAX`, which no join iteration reaches.
fn row_rng(seed: u64, row: usize, iteration: usize) -> Xoshiro256PlusPlus {
    let mut key = seed ^ (row as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    key ^= (iteration as u64).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    key = (key ^ (key >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    key = (key ^ (key >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    Xoshiro256PlusPlus::seed_from_u64(key ^ (key >> 31))
}

/// Samples `count` of `pool` in place order; the whole pool when it fits.
fn sample_pool(pool: &mut Vec<u32>, count: usize, rng: impl Rng) {
    if pool.len() <= count {
        return;
    }
    let keep = sample_indices_vec(rng, pool.len(), count);
    let mut kept: Vec<u32> = keep.iter().map(|index| pool[index]).collect();
    kept.sort_unstable();
    *pool = kept;
}

impl KnnConstruction for NnDescent {
    type Error = NnDescentError;

    fn construct(
        &mut self,
        embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
        width: NonZero<usize>,
        mut rng: impl Rng + SeedableRng,
    ) -> Result<NeighbourLists, Self::Error> {
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

        // The trait admits l2-normalized representations only, so the
        // cosine distance reduces to one minus the dot product — a third
        // of the full kernel's multiply-adds; the clamp absorbs
        // unit-norm rounding at the range's ends.
        let distance = |lhs: u32, rhs: u32| -> f32 {
            (1.0 - embeddings[lhs as usize].dot(&embeddings[rhs as usize])).clamp(0.0, 2.0)
        };

        let lists = initialize(rows, width, seed, &distance);

        #[expect(
            clippy::cast_precision_loss,
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "the entry count is far below exact f64 integer precision and the threshold \
                      only gates a loop"
        )]
        let threshold = (self.options.termination * (rows * width) as f64).ceil() as u64;

        for iteration in 0..self.options.maximum_iterations {
            let (forward_new, forward_old) = sample_forward(&lists, cap, seed, iteration);

            // Reversal: transpose the sampled sets, then cap each pool.
            let reverse_new = reverse(&forward_new, rows, cap, seed, iteration);
            let reverse_old = reverse(&forward_old, rows, cap, seed, iteration);

            // Local join: sampled new candidates meet every other
            // sampled candidate; each distance is offered both ways.
            let accepted = AtomicU64::new(0);
            (0..rows).into_par_iter().for_each(|row| {
                let mut new = [forward_new[row].as_slice(), reverse_new[row].as_slice()].concat();
                new.sort_unstable();
                new.dedup();
                let mut old = [forward_old[row].as_slice(), reverse_old[row].as_slice()].concat();
                old.sort_unstable();
                old.dedup();

                let mut updates = 0;
                let mut offer = |lhs: u32, rhs: u32| {
                    if lhs == rhs {
                        return;
                    }
                    let separation = distance(lhs, rhs);
                    updates += u64::from(lists[lhs as usize].offer(rhs, separation));
                    updates += u64::from(lists[rhs as usize].offer(lhs, separation));
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

            if accepted.load(Ordering::Relaxed) <= threshold {
                break;
            }
        }

        let placeholder = Neighbour {
            id: NodeRowId::new(0),
            distance: 0.0,
        };
        let mut entries = vec![placeholder; rows * width].into_boxed_slice();
        entries
            .par_chunks_mut(width)
            .enumerate()
            .for_each(|(row, slots)| {
                let list = lists[row]
                    .entries
                    .lock()
                    .expect("the join finished; no offer holds a lock");
                for (slot, entry) in slots.iter_mut().zip(list.iter()) {
                    *slot = Neighbour {
                        id: NodeRowId::new(u64::from(entry.id)),
                        distance: entry.distance,
                    };
                }
            });

        Ok(NeighbourLists::new(entries, width))
    }
}

/// Initializes every row's list with `width` distinct random non-self rows.
///
/// Sampling draws over a domain one short and shifts past the row itself, excluding it without
/// rejection.
fn initialize(
    rows: usize,
    width: usize,
    seed: u64,
    distance: &(impl Fn(u32, u32) -> f32 + Sync),
) -> Vec<RowList> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the construction rejects row domains beyond u32 at entry"
    )]
    (0..rows)
        .into_par_iter()
        .map(|row| {
            let sampled = sample_indices_vec(row_rng(seed, row, usize::MAX), rows - 1, width);
            RowList::new(
                sampled
                    .iter()
                    .map(|index| {
                        let id = if index >= row { index + 1 } else { index } as u32;
                        Entry {
                            distance: distance(row as u32, id),
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
/// Splits each list by the *new* flag, samples each side to `cap`, and clears the flag on the
/// sampled new entries so no join recompares them.
fn sample_forward(
    lists: &[RowList],
    cap: usize,
    seed: u64,
    iteration: usize,
) -> (Vec<Vec<u32>>, Vec<Vec<u32>>) {
    let mut forward_new: Vec<Vec<u32>> = Vec::with_capacity(lists.len());
    let mut forward_old: Vec<Vec<u32>> = Vec::with_capacity(lists.len());
    lists
        .par_iter()
        .enumerate()
        .map(|(row, list)| {
            let mut rng = row_rng(seed, row, iteration);
            let mut entries = list.entries.lock().expect("a sampling pass cannot panic");
            let mut new: Vec<u32> = entries
                .iter()
                .filter(|entry| entry.new)
                .map(|entry| entry.id)
                .collect();
            let mut old: Vec<u32> = entries
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
    (forward_new, forward_old)
}

/// Transposes sampled candidate sets and caps each reverse pool.
fn reverse(
    forward: &[Vec<u32>],
    rows: usize,
    cap: usize,
    seed: u64,
    iteration: usize,
) -> Vec<Vec<u32>> {
    // Counting transpose: in-degrees, offsets, then a parallel fill
    // whose per-pool order is nondeterministic and irrelevant — the
    // pools are sorted before sampling, so the draw sees one order.
    let counts: Vec<AtomicUsize> = core::iter::repeat_with(|| AtomicUsize::new(0))
        .take(rows)
        .collect();
    forward.par_iter().for_each(|targets| {
        for &target in targets {
            counts[target as usize].fetch_add(1, Ordering::Relaxed);
        }
    });

    let mut pools: Vec<Vec<u32>> = counts
        .par_iter()
        .map(|count| Vec::with_capacity(count.load(Ordering::Relaxed)))
        .collect();
    {
        let slots: Vec<Mutex<&mut Vec<u32>>> = pools.iter_mut().map(Mutex::new).collect();
        forward
            .par_iter()
            .enumerate()
            .for_each(|(source, targets)| {
                #[expect(
                    clippy::cast_possible_truncation,
                    reason = "the construction rejects row domains beyond u32 at entry"
                )]
                let source = source as u32;
                for &target in targets {
                    slots[target as usize]
                        .lock()
                        .expect("a transpose fill cannot panic")
                        .push(source);
                }
            });
    }

    pools
        .into_par_iter()
        .enumerate()
        .map(|(target, mut pool)| {
            pool.sort_unstable();
            // The domain flip keeps the reverse draw independent of the
            // forward sampling pass, which keys the same (row, iteration).
            sample_pool(&mut pool, cap, row_rng(!seed, target, iteration));
            pool
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use core::sync::atomic::Ordering;

    use super::{Entry, RowList};

    fn list(pairs: &[(f32, u32)]) -> RowList {
        RowList::new(
            pairs
                .iter()
                .map(|&(distance, id)| Entry {
                    distance,
                    id,
                    new: false,
                })
                .collect(),
        )
    }

    #[test]
    fn offer_displaces_the_worst_entry() {
        let row = list(&[(0.1, 7), (0.5, 3), (0.9, 11)]);
        assert!(row.offer(4, 0.3));

        let entries = row.entries.lock().expect("the test holds the only handle");
        let ids: Vec<u32> = entries.iter().map(|entry| entry.id).collect();
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
        let row = list(&[(0.1, 7), (0.5, 3), (0.9, 11)]);
        assert!(!row.offer(3, 0.2), "a present id cannot enter twice");
        assert!(!row.offer(4, 0.9), "a tie with the worst does not displace");
        assert!(!row.offer(4, 1.5), "a worse candidate does not displace");

        let entries = row.entries.lock().expect("the test holds the only handle");
        assert_eq!(entries.len(), 3);
    }
}
