use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::{openapi, ToSchema};

#[derive(
    Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, FromSql, ToSql,
)]
#[repr(transparent)]
#[postgres(transparent)]
pub struct OntologyTypeVersion(u32);

impl OntologyTypeVersion {
    #[must_use]
    pub const fn new(inner: u32) -> Self {
        Self(inner)
    }

    #[must_use]
    pub const fn inner(&self) -> u32 {
        self.0
    }
}

impl ToSchema for OntologyTypeVersion {
    fn schema() -> openapi::Schema {
        openapi::Schema::Object(openapi::schema::Object::with_type(
            openapi::SchemaType::String,
        ))
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, ToSchema)]
pub struct OntologyTypeEditionId {
    #[schema(value_type = String)]
    base_id: BaseUri,
    version: OntologyTypeVersion,
}

impl OntologyTypeEditionId {
    #[must_use]
    pub const fn new(base_id: BaseUri, version: OntologyTypeVersion) -> Self {
        Self { base_id, version }
    }

    #[must_use]
    pub const fn base_id(&self) -> &BaseUri {
        &self.base_id
    }

    #[must_use]
    pub const fn version(&self) -> OntologyTypeVersion {
        self.version
    }
}

// TODO: The Type System crate doesn't let us destructure so we need to clone base_uri
impl From<VersionedUri> for OntologyTypeEditionId {
    fn from(versioned_uri: VersionedUri) -> Self {
        Self {
            base_id: versioned_uri.base_uri().clone(),
            version: OntologyTypeVersion::new(versioned_uri.version()),
        }
    }
}

impl From<OntologyTypeEditionId> for VersionedUri {
    fn from(edition_id: OntologyTypeEditionId) -> Self {
        // TODO: we should make it possible to destructure to avoid the clone
        Self::new(edition_id.base_id().clone(), edition_id.version.inner())
    }
}
