mod metadata;
pub mod schema;

use uuid::Uuid;

pub use self::{
    metadata::{PropertyTypeMetadata, PropertyTypeWithMetadata},
    schema::PropertyType,
};
use super::id::{OntologyTypeUuid, VersionedUrl};

/// A unique identifier for a [`PropertyType`] generated from a [`VersionedUrl`].
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::FromSql, postgres_types::ToSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct PropertyTypeUuid(OntologyTypeUuid);

impl PropertyTypeUuid {
    /// Creates a new instance of the identifier type from a [`VersionedUrl`].
    #[must_use]
    pub fn from_url(url: &VersionedUrl) -> Self {
        Self(OntologyTypeUuid::from_url(url))
    }

    /// Returns a reference to the inner [`Uuid`].
    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        self.0.as_uuid()
    }

    /// Returns a copy of the inner [`Uuid`].
    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0.into_uuid()
    }
}

impl From<PropertyTypeUuid> for OntologyTypeUuid {
    fn from(value: PropertyTypeUuid) -> Self {
        value.0
    }
}

impl From<OntologyTypeUuid> for PropertyTypeUuid {
    fn from(value: OntologyTypeUuid) -> Self {
        Self(value)
    }
}
