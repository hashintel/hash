//! Delta-local row offsets beyond a snapshotted base domain.

use hashql_core::id::Id;

use crate::serve::codec::RowDomain;

hashql_core::id::newtype! {
    /// A delta-local offset for a row past `origin`, the base domain snapshotted at construction.
    pub(crate) struct DeltaRowId<I>(u64)
}

impl<I> DeltaRowId<I> {
    /// Returns `index`'s offset past the base domain, or `None` for a base row.
    ///
    /// [`RowDomain::size`] must preserve `origin`'s bound for this classification to hold.
    /// Generated integer-backed IDs truncate a bound wider than `usize` through that conversion.
    pub(crate) const fn derive(origin: RowDomain<I>, index: I) -> Option<Self>
    where
        I: [const] Id,
    {
        let index = index.as_u64();
        let offset = origin.size();

        index.checked_sub(offset as u64).map(Self::new)
    }
}
