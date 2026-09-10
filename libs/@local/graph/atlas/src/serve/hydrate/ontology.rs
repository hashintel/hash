use alloc::sync::Arc;

use error_stack::Report;
use hashql_core::id::{IdSlice, IdVec};
use type_system::ontology::VersionedUrl;

use super::{HydrateError, TypeSlot};
use crate::postgres::id::ArchivedOntologyTypeUuid;

/// The capability to resolve type URLs in request order.
pub(crate) trait OntologyResolver {
    fn resolve(
        &self,
        types: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
    ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, Report<HydrateError>>;
}

impl<T> OntologyResolver for &T
where
    T: OntologyResolver,
{
    fn resolve(
        &self,
        types: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
    ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, Report<HydrateError>> {
        T::resolve(self, types)
    }
}

impl<T> OntologyResolver for Arc<T>
where
    T: OntologyResolver,
{
    fn resolve(
        &self,
        types: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
    ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, Report<HydrateError>> {
        T::resolve(self, types)
    }
}
