//! Wire intern tables.
//!
//! A trailer ships each referenced string once: the table is the bytewise-sorted, deduplicated
//! union of every reference the trailer makes, and every reference keys by index into it. The
//! per-entity ascending-name order the hydration layer produces maps to ascending index order,
//! so the wire's ordering laws hold by construction.

/// One trailer's intern table.
///
/// Construction collects every reference first, so lookups are total for the trailer that built
/// the table.
#[derive(Debug)]
pub(super) struct Table<'doc> {
    /// The interned strings, ascending bytewise, deduplicated.
    entries: Vec<&'doc str>,
}

impl<'doc> Table<'doc> {
    /// Builds the table over every reference the trailer makes.
    pub(super) fn new(references: impl IntoIterator<Item = &'doc str>) -> Self {
        let mut entries: Vec<&str> = references.into_iter().collect();
        entries.sort_unstable();
        entries.dedup();

        Self { entries }
    }

    /// Returns a reference's table index.
    ///
    /// # Panics
    ///
    /// Panics for a string the table does not intern, which construction over the whole
    /// reference set rules out.
    pub(super) fn index_of(&self, reference: &str) -> u32 {
        let index = self
            .entries
            .binary_search(&reference)
            .expect("every referenced string is interned");

        u32::try_from(index).expect("the table is far below u32::MAX entries")
    }

    /// Views the interned strings, ascending bytewise.
    pub(super) const fn entries(&self) -> &[&'doc str] {
        &self.entries
    }
}

/// Borrows one owned detail column as the encoder's `&str` view.
pub(super) fn borrowed(entries: &[Option<String>]) -> Vec<Option<&str>> {
    entries.iter().map(Option::as_deref).collect()
}
