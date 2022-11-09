use serde::{Deserialize, Serialize};
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::ToSchema;

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, ToSchema)]
pub struct OntologyTypeEditionId {
    #[schema(value_type = String)]
    base_uri: BaseUri,
    version: u32,
}

// TODO: The Type System crate doesn't let us destructure so we need to clone base_uri
impl From<VersionedUri> for OntologyTypeEditionId {
    fn from(versioned_uri: VersionedUri) -> Self {
        Self {
            base_uri: versioned_uri.base_uri().clone(),
            version: versioned_uri.version(),
        }
    }
}
