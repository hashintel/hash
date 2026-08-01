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
/// ```
/// use hash_graph_atlas::{bitset::CompressedBitSet, identity::NodeRowId};
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
/// A set built in one pass collects from an iterator, and iterates back in ascending row order:
///
/// ```
/// use hash_graph_atlas::{bitset::CompressedBitSet, identity::EdgeRowId};
///
/// let links = CompressedBitSet::from_rows([4, 1, 2].map(EdgeRowId::new));
///
/// assert_eq!(
///     links.iter().collect::<Vec<_>>(),
///     [1, 2, 4].map(EdgeRowId::new)
/// );
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompressedBitSet<T> {
    rows: RoaringBitmap,
    marker: PhantomData<T>,
}

impl<T> Default for CompressedBitSet<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> CompressedBitSet<T> {
    /// Creates a set admitting no rows.
    #[must_use]
    pub fn new() -> Self {
        Self {
            rows: RoaringBitmap::new(),
            marker: PhantomData,
        }
    }

    /// Returns the number of rows the set admits.
    #[must_use]
    pub fn count(&self) -> u64 {
        self.rows.len()
    }

    /// Returns whether the set admits no rows.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
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
    pub fn from_rows(rows: impl IntoIterator<Item = T>) -> Self {
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
    pub fn insert(&mut self, row: T) -> bool {
        let row = u32::try_from(row.as_u64()).expect("the row lies in the representable domain");
        self.rows.insert(row)
    }

    /// Removes `row`, returning whether the set changed.
    pub fn remove(&mut self, row: T) -> bool {
        u32::try_from(row.as_u64()).is_ok_and(|row| self.rows.remove(row))
    }

    /// Returns whether the set admits `row`.
    ///
    /// A row above the representable domain is not admitted.
    #[must_use]
    pub fn contains(&self, row: T) -> bool {
        u32::try_from(row.as_u64()).is_ok_and(|row| self.rows.contains(row))
    }

    /// Iterates the rows the set admits, in ascending order.
    pub fn iter(&self) -> impl Iterator<Item = T> + '_ {
        self.rows.iter().map(T::from_u32)
    }
}
