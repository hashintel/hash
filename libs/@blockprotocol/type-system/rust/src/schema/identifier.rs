#[cfg(feature = "postgres")]
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;
use uuid::Uuid;

use crate::url::VersionedUrl;

macro_rules! define_id_type {
    ($(#[$attributes:meta])*pub struct $name:ident;) => {
        $(#[$attributes])*
        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[cfg_attr(feature = "utoipa", derive(ToSchema))]
        #[cfg_attr(feature = "postgres", derive(FromSql, ToSql), postgres(transparent))]
        #[repr(transparent)]
        pub struct $name(Uuid);

        impl $name {
            /// Creates a new instance of the identifier type from a [`VersionedUrl`].
            #[must_use]
            pub fn from_url(url: &VersionedUrl) -> Self {
                Self(Uuid::new_v5(
                    &Uuid::NAMESPACE_URL,
                    url.to_string().as_bytes(),
                ))
            }

            /// Returns a reference to the inner [`Uuid`].
            #[must_use]
            pub const fn as_uuid(&self) -> &Uuid {
                &self.0
            }

            /// Returns a copy of the inner [`Uuid`].
            #[must_use]
            pub const fn into_uuid(self) -> Uuid {
                self.0
            }
        }
    };
}

define_id_type!(
    /// A unique identifier for a [`DataType`] generated from a [`VersionedUrl`].
    ///
    /// [`DataType`]: crate::schema::DataType
    pub struct DataTypeUuid;
);

define_id_type!(
    /// A unique identifier for a [`PropertyType`] generated from a [`VersionedUrl`].
    ///
    /// [`PropertyType`]: crate::schema::PropertyType
    pub struct PropertyTypeUuid;
);

define_id_type!(
    /// A unique identifier for an [`EntityType`] generated from a [`VersionedUrl`].
    ///
    /// [`EntityType`]: crate::schema::EntityType
    pub struct EntityTypeUuid;
);

define_id_type!(
    /// A unique identifier for an ontology record generated from a [`VersionedUrl`].
    ///
    /// In some contexts it's not known to which schema an ontology record belongs, so this
    /// identifier is used to reference the record without knowing its type. When appropriate,
    /// this identifier can be converted to a more specific identifier type.
    pub struct OntologyTypeUuid;
);

impl From<PropertyTypeUuid> for OntologyTypeUuid {
    fn from(property_type_uuid: PropertyTypeUuid) -> Self {
        Self(property_type_uuid.into_uuid())
    }
}

impl From<OntologyTypeUuid> for PropertyTypeUuid {
    fn from(ontology_type_uuid: OntologyTypeUuid) -> Self {
        Self(ontology_type_uuid.into_uuid())
    }
}

impl From<EntityTypeUuid> for OntologyTypeUuid {
    fn from(entity_type_uuid: EntityTypeUuid) -> Self {
        Self(entity_type_uuid.into_uuid())
    }
}

impl From<OntologyTypeUuid> for EntityTypeUuid {
    fn from(ontology_uuid: OntologyTypeUuid) -> Self {
        Self(ontology_uuid.into_uuid())
    }
}

impl From<DataTypeUuid> for OntologyTypeUuid {
    fn from(data_type_uuid: DataTypeUuid) -> Self {
        Self(data_type_uuid.into_uuid())
    }
}

impl From<OntologyTypeUuid> for DataTypeUuid {
    fn from(ontology_uuid: OntologyTypeUuid) -> Self {
        Self(ontology_uuid.into_uuid())
    }
}
