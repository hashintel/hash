//! Wire intern tables.
//!
//! A trailer stores each referenced value's wire spelling once. The table renders every
//! reference the trailer makes, deduplicated and ascending bytewise, and every reference keys by
//! index into it. The per-entity ascending-name order the hydration layer produces maps to
//! ascending index order, so the wire's ordering laws hold by construction.
//!
//! The table owns the ordering resolution between a domain type and its wire spelling. A
//! [`VersionedUrl`] orders its version numerically, which disagrees with bytewise order over the
//! rendering for multi-digit versions, so the wire order runs over the renderings while the
//! value's own order only deduplicates.

use alloc::borrow::Cow;
use core::{
    cmp::Ordering,
    fmt::{self, Debug, Display},
    hash::{Hash, Hasher},
    marker::PhantomData,
};

use hashql_core::{
    algorithms::co_sort,
    id::{Id, IdError, IdSlice, IdVec},
};
use type_system::ontology::id::{BaseUrl, VersionedUrl};

/// A value a trailer references by intern-table index.
///
/// The contract behind [`Table`]'s deduplication: two references render equal exactly when they
/// are equal, so deduplicating by the reference's own order is deduplicating by rendering.
pub(super) trait Reference: Ord {
    /// Renders the reference in its wire spelling.
    fn rendering(&self) -> Cow<'_, str>;
}

impl Reference for BaseUrl {
    fn rendering(&self) -> Cow<'_, str> {
        Cow::Borrowed(self.as_str())
    }
}

impl Reference for VersionedUrl {
    fn rendering(&self) -> Cow<'_, str> {
        // The rendering is injective: the base URL ends with `/` by validation and the version
        // is numeric, so `{base}v/{version}` parses back uniquely from its right end.
        Cow::Owned(self.to_string())
    }
}

/// One reference's index into its domain's intern table.
///
/// The parameter is the interned domain. A type-table index and a property-table index are
/// distinct types, and one response builds exactly one table per domain, so an index cannot
/// reach the wrong table. Index order is the table's wire order: ascending bytewise over the
/// interned renderings.
// Manual implementations: a derive would bound `T`, and the parameter is phantom - `fn() -> T`
// keeps the index `Copy`, `Send` and `Sync` for every domain.
pub(crate) struct TableIndex<T>(u32, PhantomData<fn() -> T>);

impl<T> TableIndex<T> {
    /// Creates an index from a raw table position.
    #[must_use]
    #[inline]
    pub(crate) const fn new(value: u32) -> Self {
        Self(value, PhantomData)
    }
}

impl<T> Copy for TableIndex<T> {}

impl<T> Clone for TableIndex<T> {
    #[inline]
    fn clone(&self) -> Self {
        *self
    }
}

const impl<T> PartialEq for TableIndex<T> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

const impl<T> Eq for TableIndex<T> {}

const impl<T> PartialOrd for TableIndex<T> {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

const impl<T> Ord for TableIndex<T> {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.cmp(&other.0)
    }
}

impl<T> Hash for TableIndex<T> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.hash(state);
    }
}

impl<T> Debug for TableIndex<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_tuple("TableIndex").field(&self.0).finish()
    }
}

impl<T> Display for TableIndex<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.0, fmt)
    }
}

const impl<T> TryFrom<u32> for TableIndex<T> {
    type Error = IdError;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        Ok(Self::new(value))
    }
}

const impl<T> TryFrom<u64> for TableIndex<T> {
    type Error = IdError;

    fn try_from(value: u64) -> Result<Self, Self::Error> {
        if value <= u32::MAX as u64 {
            #[expect(
                clippy::cast_possible_truncation,
                reason = "guarded by the range check"
            )]
            Ok(Self::new(value as u32))
        } else {
            Err(IdError::OutOfRange {
                value,
                min: 0,
                max: u32::MAX as u64,
            })
        }
    }
}

const impl<T> TryFrom<usize> for TableIndex<T> {
    type Error = IdError;

    fn try_from(value: usize) -> Result<Self, Self::Error> {
        if value as u64 <= u32::MAX as u64 {
            #[expect(
                clippy::cast_possible_truncation,
                reason = "guarded by the range check"
            )]
            Ok(Self::new(value as u32))
        } else {
            Err(IdError::OutOfRange {
                value: value as u64,
                min: 0,
                max: u32::MAX as u64,
            })
        }
    }
}

const impl<T: 'static> Id for TableIndex<T> {
    const MAX: Self = Self::new(u32::MAX);
    const MIN: Self = Self::new(0);

    #[inline]
    fn from_u32(index: u32) -> Self {
        Self::new(index)
    }

    #[inline]
    fn from_u64(index: u64) -> Self {
        assert!(index <= u32::MAX as u64, "id value must fit in `u32`");

        #[expect(
            clippy::cast_possible_truncation,
            reason = "guarded by the width assertion"
        )]
        Self::new(index as u32)
    }

    #[inline]
    fn from_usize(index: usize) -> Self {
        assert!(
            index as u64 <= u32::MAX as u64,
            "id value must fit in `u32`"
        );

        #[expect(
            clippy::cast_possible_truncation,
            reason = "guarded by the width assertion"
        )]
        Self::new(index as u32)
    }

    #[inline]
    fn as_u32(self) -> u32 {
        self.0
    }

    #[inline]
    fn as_u64(self) -> u64 {
        self.0 as u64
    }

    #[inline]
    fn as_usize(self) -> usize {
        self.0 as usize
    }

    #[inline]
    fn prev(self) -> Option<Self> {
        match self.0.checked_sub(1) {
            Some(value) => Some(Self::new(value)),
            None => None,
        }
    }
}

/// One trailer's intern table.
///
/// Construction collects every reference first, so lookups are total for the trailer that built
/// the table. Each unique reference renders once, at construction, and the entries borrow where
/// the reference already is its own spelling.
#[derive(Debug)]
pub(super) struct Table<'doc, T> {
    /// The interned renderings, ascending bytewise, deduplicated.
    entries: IdVec<TableIndex<T>, Cow<'doc, str>>,
    /// The interned references in their own ascending order, each with its wire index.
    lookup: Vec<(&'doc T, TableIndex<T>)>,
}

impl<'doc, T: Reference + 'static> Table<'doc, T> {
    /// Builds the table over every reference the trailer makes.
    ///
    /// # Panics
    ///
    /// This panics for a table above `u32::MAX` entries.
    pub(super) fn new(references: impl IntoIterator<Item = &'doc T>) -> Self {
        let mut values: Vec<&'doc T> = references.into_iter().collect();
        values.sort_unstable();
        values.dedup();

        let (mut entries, mut lookup): (IdVec<TableIndex<T>, _>, Vec<_>) = values
            .into_iter()
            .map(|value| (value.rendering(), (value, TableIndex::MIN)))
            .collect();

        // `str` orders byte-lexicographically, so the renderings' own order is the wire's
        // bytewise order.
        co_sort(entries.as_raw_mut(), &mut lookup);
        for (index, (_, table_index)) in lookup.iter_mut().enumerate() {
            *table_index = TableIndex::from_usize(index);
        }

        lookup.sort_unstable_by_key(|&(value, _)| value);

        Self { entries, lookup }
    }

    /// Returns a reference's table index.
    ///
    /// # Panics
    ///
    /// This panics for a reference the table does not intern, which construction over the whole
    /// reference set rules out.
    pub(super) fn index_of(&self, reference: &T) -> TableIndex<T> {
        let index = self
            .lookup
            .binary_search_by(|&(value, _)| value.cmp(reference))
            .expect("every reference is interned");

        self.lookup[index].1
    }

    /// Views the interned renderings, ascending bytewise.
    pub(super) const fn entries(&self) -> &IdSlice<TableIndex<T>, Cow<'doc, str>> {
        &self.entries
    }
}
