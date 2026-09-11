use core::marker::PhantomData;

use hashql_core::id::Id;
use roaring::RoaringBitmap;

/// A compressed membership set over one row domain.
///
/// Memory is proportional to what the set admits (its cardinality and the runs its rows form)
/// rather than to the size of the domain it draws from. A set admitting a few thousand rows of a
/// million-row domain costs kilobytes. A set admitting one contiguous span costs a constant. That
/// makes this the shape for a per-request or per-session row set, where one bit per domain row
/// costs the whole domain however few rows the set admits.
///
/// The type parameter names the domain, so a set of node rows and a set of link rows have different
/// types and the compiler rejects either one where the other belongs.
///
/// The representable domain is `0..u32::MAX`. [`Self::contains`] answers `false` for a row above
/// it, so a query is total over the id type, while [`Self::insert`] panics rather than dropping the
/// row.
///
/// # Examples
///
/// ```ignore
/// use crate::identity::NodeRowId;
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
/// Iteration ascends by row, whatever the insertion order:
///
/// ```ignore
/// use crate::identity::EdgeRowId;
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
    rows: RoaringBitmap,
    marker: PhantomData<fn() -> T>,
}

impl<T> CompressedBitSet<T> {
    /// Per-container bookkeeping allowance for [`Self::heap_bytes`], in bytes.
    ///
    /// The store keeps each container behind its own entry - key, variant tag and the
    /// container's inline vector or box - which the payload statistics do not report. The
    /// allowance is a deliberate overestimate of that entry, so a heavily containerized set
    /// never reads as cheaper than it is.
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
    /// The figure sums the bitmap's array, run and bitset container payloads plus
    /// [`Self::CONTAINER_ALLOWANCE`] per container, so it moves with the compression the row
    /// distribution earns rather than with the row count. The wrapper's own inline size and
    /// allocator slack are not counted.
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
