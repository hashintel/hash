//! The base delivery order.

use rayon::prelude::*;

use super::rank::Ranking;
use crate::morton::{Depth, MortonKey};

/// The base delivery order of one generation: bucket-major, Morton
/// within bucket, rank within key ties.
///
/// Every served column publishes in this order, filters index it, and
/// a tile is a set of contiguous runs of it. The order is a pure
/// function of buckets, keys, and ranking - the third sort component
/// makes ties total, so the permutation is unique and reproducible.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BaseOrder {
    /// Row index by base position: the gather order that assembles a
    /// served column from a row-ordered one.
    pub row_of_position: Box<[u32]>,
    /// Base position by row index: the row-to-position permutation the
    /// filter contract maps entity ids through.
    pub position_of_row: Box<[u32]>,
}

impl BaseOrder {
    /// Sorts the rows into delivery order.
    ///
    /// # Panics
    ///
    /// Panics when `keys`, `buckets`, and `ranking` disagree on the row
    /// count.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the ranking's constructor admits only row counts that fit `u32`"
    )]
    #[must_use]
    pub(crate) fn new(keys: &[MortonKey], buckets: &[Depth], ranking: &Ranking) -> Self {
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

        let mut row_of_position: Vec<u32> = (0..keys.len() as u32).collect();
        row_of_position.par_sort_unstable_by_key(|&row| {
            let row = row as usize;
            (buckets[row], keys[row], ranking.rank_of_row[row])
        });

        let mut position_of_row = vec![0_u32; row_of_position.len()];
        for (position, &row) in row_of_position.iter().enumerate() {
            position_of_row[row as usize] = position as u32;
        }

        Self {
            row_of_position: row_of_position.into_boxed_slice(),
            position_of_row: position_of_row.into_boxed_slice(),
        }
    }
}
