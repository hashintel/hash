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

/// One trailer's intern table.
///
/// Construction collects every reference first, so lookups are total for the trailer that built
/// the table. Each unique reference renders once, at construction, and the entries borrow where
/// the reference already is its own spelling.
#[derive(Debug)]
pub(super) struct Table<'doc, T> {
    /// The interned renderings, ascending bytewise, deduplicated.
    rendered: Vec<Cow<'doc, str>>,
    /// The interned references in their own ascending order, each with its wire index.
    lookup: Vec<(&'doc T, u32)>,
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

        let mut entries: Vec<(Cow<'doc, str>, &'doc T)> = values
            .into_iter()
            .map(|value| (value.rendering(), value))
            .collect();
        entries.sort_unstable_by(|left, right| left.0.as_bytes().cmp(right.0.as_bytes()));

        let mut lookup: Vec<(&'doc T, u32)> = entries
            .iter()
            .enumerate()
            .map(|(wire, &(_, value))| {
                let wire = u32::try_from(wire).expect("the table is far below u32::MAX entries");
                (value, wire)
            })
            .collect();
        lookup.sort_unstable_by(|left, right| left.0.cmp(right.0));
        let rendered = entries
            .into_iter()
            .map(|(rendering, _)| rendering)
            .collect();

        Self { rendered, lookup }
    }

    /// Returns a reference's table index.
    ///
    /// # Panics
    ///
    /// This panics for a reference the table does not intern, which construction over the whole
    /// reference set rules out.
    pub(super) fn index_of(&self, reference: &T) -> u32 {
        let index = self
            .lookup
            .binary_search_by(|&(value, _)| value.cmp(reference))
            .expect("every reference is interned");

        self.lookup[index].1
    }

    /// Views the interned renderings, ascending bytewise.
    pub(super) const fn entries(&self) -> &[Cow<'doc, str>] {
        &self.rendered
    }
}
