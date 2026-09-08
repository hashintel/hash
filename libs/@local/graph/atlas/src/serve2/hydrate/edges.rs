use error_stack::Report;
use hashql_core::id::{IdSlice, IdVec};
use type_system::ontology::VersionedUrl;

use super::{HydrateError, TypeSlot};
use crate::postgres::id::ArchivedOntologyTypeUuid;

pub(crate) trait OntologyResolver {
    fn resolve(
        self,
        types: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
    ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, Report<HydrateError>>;
}
