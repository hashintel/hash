use core::marker::PhantomData;

use hashql_core::id::Id;
use roaring::RoaringBitmap;

/// A compressed membership set over one row domain.
///
/// Storage is allocated only for occupied blocks of 2¹⁶ row values. Sparse blocks use sorted arrays
/// and dense blocks use bitmaps. This avoids allocating one bit per domain row when membership is
/// sparse. A contiguous span can occupy many blocks, and insertion alone does not convert them to
/// run containers.
///
/// The type parameter distinguishes row domains at compile time. A set of node rows cannot
/// substitute for a set of link rows.
///
/// The representable domain is `0..=u32::MAX`. [`Self::contains`] answers `false` for a row above
/// it, while [`Self::insert`] panics rather than dropping the row.
///
/// # Example
///
/// This in-crate example is ignored because the types are crate-private.
///
/// ```ignore
/// use crate::{bitset::CompressedBitSet, identity::NodeRowId};
///
/// let mut visible = CompressedBitSet::new();
/// visible.insert(NodeRowId::new(3));
/// visible.insert(NodeRowId::new(1_000_000));
///
/// assert!(visible.contains(NodeRowId::new(3)));
/// assert!(!visible.contains(NodeRowId::new(4)));
/// assert_eq!(visible.count(), 2);
/// ```
///
/// # Example: iterating in row order
///
/// This in-crate example is ignored because the types are crate-private.
///
/// ```ignore
/// use crate::{bitset::CompressedBitSet, identity::EdgeRowId};
///
/// let mut links = CompressedBitSet::new();
/// for row in [4, 1, 2].map(EdgeRowId::new) {
///     links.insert(row);
/// }
///
/// assert_eq!(
///     links.iter().collect::<Vec<_>>(),
///     [1, 2, 4].map(EdgeRowId::new)
/// );
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CompressedBitSet<T> {
    /// The admitted rows, as `u32` values.
    rows: RoaringBitmap,
    /// The row domain, carried in the type without owning a `T`.
    marker: PhantomData<fn() -> T>,
}

impl<T> CompressedBitSet<T> {
    /// Per-container bookkeeping allowance for [`Self::heap_bytes`], in bytes.
    ///
    /// The estimate adds this fixed charge to the reported payload for each occupied container. It
    /// does not measure the container vector's capacity or allocator overhead.
    const CONTAINER_ALLOWANCE: u64 = 64;

    /// Creates a set admitting no rows.
    #[must_use]
    pub(crate) fn new() -> Self {
        Self {
            rows: RoaringBitmap::new(),
            marker: PhantomData,
        }
    }

    /// Returns the number of rows the set admits.
    #[must_use]
    pub(crate) fn count(&self) -> u64 {
        self.rows.len()
    }

    /// Returns whether the set admits no rows.
    #[must_use]
    pub(crate) fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }

    /// Returns the set's retained container bytes.
    ///
    /// The figure sums the array, run and bitmap byte counts reported by
    /// [`RoaringBitmap::statistics`] plus [`Self::CONTAINER_ALLOWANCE`] per container. It is an
    /// estimate, not a measurement or a guaranteed upper bound on allocated bytes. The value
    /// excludes this type's inline size.
    #[must_use]
    pub(crate) fn heap_bytes(&self) -> u64 {
        let statistics = self.rows.statistics();

        statistics.n_bytes_array_containers
            + statistics.n_bytes_run_containers
            + statistics.n_bytes_bitset_containers
            + u64::from(statistics.n_containers) * Self::CONTAINER_ALLOWANCE
    }

    /// Returns whether the set admits every row of `[0, n)`.
    ///
    /// Rows at or above `n` never count against the answer: a set may admit them and still cover
    /// the range below. `n = 0` asks for no rows and answers `true`, and a range wider than the
    /// representable domain answers `false`. The check runs on the set's compressed runs rather
    /// than its rows, so a covered million-row range costs what a handful of rows cost.
    #[must_use]
    pub(crate) fn contains_below(&self, n: u64) -> bool {
        let Some(last) = n.checked_sub(1) else {
            return true;
        };

        u32::try_from(last).is_ok_and(|last| self.rows.contains_range(0..=last))
    }
}

impl<T: Id> CompressedBitSet<T> {
    /// Collects a set from the rows it admits.
    ///
    /// Duplicate rows collapse, and the input order is free.
    ///
    /// # Panics
    ///
    /// This panics when a row lies above the representable domain.
    #[must_use]
    #[cfg(test)] // The bitset and serve tests build masks from row lists cross-module.
    pub(crate) fn from_rows(rows: impl IntoIterator<Item = T>) -> Self {
        let mut set = Self::new();
        for row in rows {
            set.insert(row);
        }

        set
    }

    /// Inserts `row`, returning whether the set changed.
    ///
    /// # Panics
    ///
    /// This panics when `row` lies above the representable domain.
    pub(crate) fn insert(&mut self, row: T) -> bool {
        let row = u32::try_from(row.as_u64()).expect("the row lies in the representable domain");
        self.rows.insert(row)
    }

    /// Removes `row`, returning whether the set changed.
    pub(crate) fn remove(&mut self, row: T) -> bool {
        u32::try_from(row.as_u64()).is_ok_and(|row| self.rows.remove(row))
    }

    /// Returns whether the set admits `row`.
    ///
    /// A row above the representable domain is not admitted.
    #[must_use]
    pub(crate) fn contains(&self, row: T) -> bool {
        u32::try_from(row.as_u64()).is_ok_and(|row| self.rows.contains(row))
    }

    /// Iterates the rows the set admits, in ascending order.
    pub(crate) fn iter(&self) -> impl Iterator<Item = T> + '_ {
        self.rows.iter().map(T::from_u32)
    }
}

impl<T> Default for CompressedBitSet<T> {
    fn default() -> Self {
        Self::new()
    }
}
