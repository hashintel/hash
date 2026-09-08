use alloc::sync::Arc;

use error_stack::Report;
use hashql_core::id::{IdSlice, IdVec};
use type_system::ontology::VersionedUrl;

use super::{HydrateError, TypeSlot};
use crate::postgres::id::ArchivedOntologyTypeUuid;

/// The capability to resolve each required type uuid's versioned URL, in requirement order.
pub(crate) trait OntologyResolver {
    async fn resolve(
        &self,
        types: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
    ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, Report<HydrateError>>;
}

impl<T> OntologyResolver for &T
where
    T: OntologyResolver,
{
    async fn resolve(
        &self,
        types: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
    ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, Report<HydrateError>> {
        T::resolve(self, types).await
    }
}

impl<T> OntologyResolver for Arc<T>
where
    T: OntologyResolver,
{
    async fn resolve(
        &self,
        types: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
    ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, Report<HydrateError>> {
        T::resolve(self, types).await
    }
}
