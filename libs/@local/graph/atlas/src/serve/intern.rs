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

use hashql_core::{
    algorithms::co_sort,
    id::{Id as _, IdSlice, IdVec},
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

hashql_core::id::newtype! {
    #[id(const)]
    pub(crate) struct TableIndex(u32)
}

/// One trailer's intern table.
///
/// Construction collects every reference first, so lookups are total for the trailer that built
/// the table. Each unique reference renders once, at construction, and the entries borrow where
/// the reference already is its own spelling.
#[derive(Debug)]
pub(super) struct Table<'doc, T> {
    /// The interned renderings, ascending bytewise, deduplicated.
    entries: IdVec<TableIndex, Cow<'doc, str>>,
    /// The interned references in their own ascending order, each with its wire index.
    lookup: Vec<(&'doc T, TableIndex)>,
}

impl<'doc, T: Reference> Table<'doc, T> {
    /// Builds the table over every reference the trailer makes.
    ///
    /// # Panics
    ///
    /// This panics for a table above `u32::MAX` entries.
    pub(super) fn new(references: impl IntoIterator<Item = &'doc T>) -> Self {
        let mut values: Vec<&'doc T> = references.into_iter().collect();
        values.sort_unstable();
        values.dedup();

        let (mut entries, mut lookup): (IdVec<TableIndex, _>, Vec<_>) = values
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
    pub(super) fn index_of(&self, reference: &T) -> TableIndex {
        let index = self
            .lookup
            .binary_search_by(|&(value, _)| value.cmp(reference))
            .expect("every reference is interned");

        self.lookup[index].1
    }

    /// Views the interned renderings, ascending bytewise.
    pub(super) const fn entries(&self) -> &IdSlice<TableIndex, Cow<'doc, str>> {
        &self.entries
    }
}
