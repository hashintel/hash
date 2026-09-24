//! Bucket-major ordering for aligned serving columns.

use hashql_core::id::{Id as _, IdSlice, IdVec};

use super::rank::Ranking;
use crate::{
    identity::{BasePosition, NodeRowId},
    morton::{Depth, MortonKey},
};

/// A row permutation ordered by bucket, then Morton key, then importance rank.
///
/// Every served column publishes in this order. A bucket occupies one segment, and a tile's keys
/// within that segment occupy a contiguous run.
///
/// # Properties
///
/// For every valid [`Ranking`], ranks are pairwise distinct. The `(bucket, key, rank)` sort key
/// therefore distinguishes every row. Equal buckets, keys, and ranking give exactly the same
/// permutation and its inverse.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct BaseOrder {
    /// Each base position's row.
    ///
    /// The gather order that assembles a served column from a row-ordered one.
    pub row_of_position: Box<IdSlice<BasePosition, NodeRowId>>,
    /// Each row's base position.
    ///
    /// The inverse of [`Self::row_of_position`].
    pub position_of_row: Box<IdSlice<NodeRowId, BasePosition>>,
}

impl BaseOrder {
    /// Sorts the rows into delivery order.
    ///
    /// # Panics
    ///
    /// Panics when `keys`, `buckets`, and `ranking.row_of_rank` disagree on the row count, or when
    /// `ranking.rank_of_row` omits a row in `keys`.
    #[must_use]
    pub(crate) fn new(
        keys: &IdSlice<NodeRowId, MortonKey>,
        buckets: &IdSlice<NodeRowId, Depth>,
        ranking: &Ranking<NodeRowId>,
    ) -> Self {
        assert_eq!(
            keys.len(),
            buckets.len(),
            "the keys and the buckets must cover the same rows",
        );
        assert_eq!(
            keys.len(),
            ranking.row_of_rank.len(),
            "the keys and the ranking must cover the same rows",
        );

        let mut row_of_position: IdVec<BasePosition, NodeRowId> = keys.ids().collect();
        row_of_position
            .par_sort_unstable_by_key(|&row| (buckets[row], keys[row], ranking.rank_of_row[row]));

        let mut position_of_row = IdVec::from_elem(BasePosition::MIN, row_of_position.len());
        for (position, &row) in row_of_position.iter_enumerated() {
            position_of_row[row] = position;
        }

        Self {
            row_of_position: row_of_position.into_boxed_slice(),
            position_of_row: position_of_row.into_boxed_slice(),
        }
    }
}
