//! The base delivery order.

use hashql_core::id::{Id as _, IdSlice, IdVec};

use super::rank::Ranking;
use crate::{
    identity::{BasePosition, NodeRowId},
    morton::{Depth, MortonKey},
};

/// The base delivery order of one generation.
///
/// Bucket-major, Morton within bucket, rank within key ties.
///
/// Every served column publishes in this order, filters index it, and a tile is a set of contiguous
/// runs of it. The order is a pure function of buckets, keys, and ranking - the third sort
/// component makes ties total, so the permutation is unique and reproducible.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct BaseOrder {
    /// Each base position's row.
    ///
    /// The gather order that assembles a served column from a row-ordered one.
    pub row_of_position: Box<IdSlice<BasePosition, NodeRowId>>,
    /// Each row's base position.
    ///
    /// The row-to-position permutation the filter contract maps entity ids through.
    pub position_of_row: Box<IdSlice<NodeRowId, BasePosition>>,
}

impl BaseOrder {
    /// Sorts the rows into delivery order.
    ///
    /// # Panics
    ///
    /// This panics when `keys`, `buckets`, and `ranking` disagree on the row count.
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
