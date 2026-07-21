//! The deterministic importance ranking.

use rayon::prelude::*;
use zerocopy::IntoBytes;

use crate::integrity::{Sha256, Update as _};

/// The per-row inputs of the rank pass, one entry per point row.
///
/// Rows rank by configured importance, then stable semantic priority, then a seeded hash of the
/// entity identity, so the order is total and reproducible from the columns and the seed alone. The
/// columns are equal-length by construction and the row count fits the `u32` row encoding. `I` is
/// the dataset's node id type; the ranking consumes its canonical bytes alone.
#[derive(Debug, Copy, Clone)]
pub(crate) struct RankInputs<'columns, I> {
    importance: &'columns [f32],
    priority: &'columns [f32],
    identities: &'columns [I],
}

impl<'columns, I> RankInputs<'columns, I> {
    /// Wraps the rank columns.
    ///
    /// Returns [`None`] when the columns disagree on length or the row count does not fit the `u32`
    /// row encoding.
    #[must_use]
    pub(crate) const fn new(
        importance: &'columns [f32],
        priority: &'columns [f32],
        identities: &'columns [I],
    ) -> Option<Self> {
        if importance.len() != priority.len() || importance.len() != identities.len() {
            return None;
        }
        if u32::try_from(importance.len()).is_err() {
            return None;
        }

        Some(Self {
            importance,
            priority,
            identities,
        })
    }

    /// Returns the row count.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the constructor admits only row counts that fit `u32`"
    )]
    #[inline]
    #[must_use]
    pub(crate) const fn len(&self) -> u32 {
        self.importance.len() as u32
    }
}

/// The rank order of one generation's rows: a permutation and its inverse.
///
/// Rank 0 is the most important row. Both views exist because both are consumed: the cascade claims
/// cells in ascending rank, and the published columns record each position's rank.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Ranking {
    /// Row index by rank: `row_of_rank[rank]` is the row holding that rank.
    pub row_of_rank: Box<[u32]>,
    /// Rank by row index: `rank_of_row[row]` is the row's rank.
    pub rank_of_row: Box<[u32]>,
}

impl Ranking {
    /// Ranks the rows by descending importance.
    ///
    /// Then descending priority, then the seeded identity hash ascending.
    ///
    /// Scores compare under IEEE 754 `totalOrder`, so the ranking is total and deterministic for
    /// every bit pattern; both score columns arrive finite - importance by the
    /// [`ImportanceSignal`](crate::salt::importance::ImportanceSignal) contract, priority as a
    /// constant column until it grows a source - and nothing here re-checks them. Equal seeds give
    /// equal rankings; the seed is recorded in the generation's metadata.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the inputs' constructor admits only row counts that fit `u32`"
    )]
    #[must_use]
    pub(crate) fn new<I>(inputs: RankInputs<'_, I>, seed: u64) -> Self
    where
        I: Copy + IntoBytes + zerocopy::Immutable + Sync,
    {
        let tiebreaks: Vec<u64> = inputs
            .identities
            .par_iter()
            .map(|identity| tiebreak(seed, identity))
            .collect();

        let mut row_of_rank: Vec<u32> = (0..inputs.len()).collect();
        row_of_rank.par_sort_unstable_by(|&left, &right| {
            let (left, right) = (left as usize, right as usize);

            // Descending importance, descending priority: the reversed
            // comparisons spell the negation SPEC's lexicographic key
            // applies to the scores.
            inputs.importance[right]
                .total_cmp(&inputs.importance[left])
                .then_with(|| inputs.priority[right].total_cmp(&inputs.priority[left]))
                .then_with(|| tiebreaks[left].cmp(&tiebreaks[right]))
        });

        let mut rank_of_row = vec![0_u32; row_of_rank.len()];
        for (rank, &row) in row_of_rank.iter().enumerate() {
            rank_of_row[row as usize] = rank as u32;
        }

        Self {
            row_of_rank: row_of_rank.into_boxed_slice(),
            rank_of_row: rank_of_row.into_boxed_slice(),
        }
    }
}

/// Hashes one entity identity under the ranking seed.
///
/// The first eight digest bytes, little endian, of the SHA-256 over the seed followed by the
/// identity bytes. Identities are unique per row, SHA-256 is collision-resistant at this width for
/// corpus-scale row counts, and a new seed reshuffles every tie deterministically.
#[expect(
    clippy::little_endian_bytes,
    reason = "the hash is pinned to the same canonical little-endian bytes on every platform"
)]
fn tiebreak<I: IntoBytes + zerocopy::Immutable>(seed: u64, identity: &I) -> u64 {
    let mut hasher = Sha256::new();
    hasher.update(&seed.to_le_bytes());
    hasher.update(identity.as_bytes());
    let digest = hasher.finalize().to_bytes();

    u64::from_le_bytes(digest[..8].try_into().expect("eight bytes are eight bytes"))
}
