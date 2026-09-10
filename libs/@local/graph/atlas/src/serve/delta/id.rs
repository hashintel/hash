use hashql_core::id::Id;

use crate::serve::codec::RowDomain;

hashql_core::id::newtype! {
    pub(crate) struct DeltaRowId<I>(u64)
}

impl<I> DeltaRowId<I> {
    pub(crate) const fn derive(origin: RowDomain<I>, index: I) -> Option<Self>
    where
        I: [const] Id,
    {
        let index = index.as_u64();
        let offset = origin.size();

        index.checked_sub(offset as u64).map(Self::new)
    }
}
