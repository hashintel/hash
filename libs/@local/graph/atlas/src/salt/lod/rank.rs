//! Importance ordering with seeded identity tie-breaking.

use hashql_core::id::{Id, IdSlice, IdVec};
use rayon::iter::ParallelIterator as _;
use zerocopy::IntoBytes;

use crate::{
    identity::{ImportanceRank, NodeRowId},
    integrity::{Sha256, Update as _},
};

/// Equal-length importance, priority, and identity columns for ranking point rows.
///
/// The row count fits `u32`. [`Ranking::new`] orders the scores and uses a seeded hash of each
/// identity's bytes to break score ties. Construction checks lengths alone, accepting every score
/// bit pattern and repeated identities.
#[derive(Debug, Copy, Clone)]
pub(crate) struct RankInputs<'columns, I> {
    importance: &'columns IdSlice<NodeRowId, f32>,
    priority: &'columns IdSlice<NodeRowId, f32>,
    identities: &'columns IdSlice<NodeRowId, I>,
}

impl<'columns, I> RankInputs<'columns, I> {
    /// Checks that the columns cover the same `u32`-sized row domain.
    ///
    /// Returns [`None`] when the columns disagree on length or the row count does not fit the `u32`
    /// row encoding.
    #[must_use]
    pub(crate) const fn new(
        importance: &'columns IdSlice<NodeRowId, f32>,
        priority: &'columns IdSlice<NodeRowId, f32>,
        identities: &'columns IdSlice<NodeRowId, I>,
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

/// A row permutation and its inverse, with rank zero first in importance order.
///
/// `row_of_rank` must contain each row exactly once, and `rank_of_row` must be its inverse over the
/// same domain. `R` identifies that domain: generation rows or the local rows of a visible subset.
/// A ranking applies only to the rows it ranked.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Ranking<R> {
    /// Row by rank: `row_of_rank[rank]` is the row holding that rank.
    pub row_of_rank: Box<IdSlice<ImportanceRank, R>>,
    /// Rank by row: `rank_of_row[row]` is the row's rank.
    pub rank_of_row: Box<IdSlice<R, ImportanceRank>>,
}

impl<R> Ranking<R>
where
    R: Id,
{
    /// Completes a ranking from its filled rank order.
    ///
    /// `row_of_rank` must be a permutation of the row universe it ranks. Duplicate rows overwrite
    /// their inverse entries and leave other entries at rank zero.
    ///
    /// # Panics
    ///
    /// Panics when a row index is at or beyond `row_of_rank.len()`.
    #[must_use]
    pub(crate) fn from_row_of_rank(row_of_rank: IdVec<ImportanceRank, R>) -> Self {
        let mut rank_of_row = IdVec::from_elem(ImportanceRank::MIN, row_of_rank.len());
        for (rank, &row) in row_of_rank.iter_enumerated() {
            rank_of_row[row] = rank;
        }

        Self {
            row_of_rank: row_of_rank.into_boxed_slice(),
            rank_of_row: rank_of_row.into_boxed_slice(),
        }
    }
}

impl Ranking<NodeRowId> {
    /// Ranks the rows by descending importance.
    ///
    /// Ties compare by descending priority, then ascending seeded identity hash. Scores use
    /// [`f32::total_cmp`], including its ordering of signed zeros and NaNs.
    ///
    /// Equal columns and seed reproduce the ranking with the current sorting implementation. Hashes
    /// have only 64 bits: equal scores and hashes leave a tie whose relative order can change with
    /// the sorting implementation. Cross-target replay also requires identical identity bytes on
    /// each target. [`IntoBytes`] alone does not establish a canonical byte order.
    ///
    /// # Complexity
    ///
    /// For N rows, sorting costs O(N log N) comparisons and O(N) storage. Hashing additionally
    /// reads every identity byte once.
    #[must_use]
    pub(crate) fn new<I>(inputs: RankInputs<'_, I>, seed: u64) -> Self
    where
        I: Copy + IntoBytes + zerocopy::Immutable + Sync,
    {
        let tiebreaks: IdVec<_, _> = inputs
            .identities
            .par_iter()
            .map(|identity| tiebreak(seed, identity))
            .collect();

        let mut row_of_rank: IdVec<_, _> = inputs.identities.ids().collect();
        row_of_rank.par_sort_unstable_by(|&left, &right| {
            // reverse only the score comparisons: smaller hashes retain precedence
            inputs.importance[right]
                .total_cmp(&inputs.importance[left])
                .then_with(|| inputs.priority[right].total_cmp(&inputs.priority[left]))
                .then_with(|| tiebreaks[left].cmp(&tiebreaks[right]))
        });

        Self::from_row_of_rank(row_of_rank)
    }
}

/// Hashes one entity identity under the ranking seed.
///
/// Interprets the first eight digest bytes as a little-endian `u64`. The digest input is the
/// little-endian seed followed by the identity's bytes. Changing the seed changes that input,
/// without guaranteeing a different hash or tie order.
#[expect(
    clippy::little_endian_bytes,
    reason = "the hash is pinned to the same canonical little-endian bytes on every platform"
)]
fn tiebreak<I: IntoBytes + zerocopy::Immutable>(seed: u64, identity: &I) -> u64 {
    let mut hasher = Sha256::new();
    hasher.update(&seed.to_le_bytes());
    hasher.update(identity.as_bytes());
    let digest = hasher.finalize().to_bytes();

    // SHA-256 returns 32 bytes, of which this fixed slice selects exactly eight.
    u64::from_le_bytes(digest[..8].try_into().expect("eight bytes are eight bytes"))
}
