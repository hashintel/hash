mod data_type;
mod entity_type;
mod property_type;

use core::fmt;
#[cfg(feature = "postgres")]
use std::error::Error;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use serde::{Deserialize, Serialize};
use temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};
use time::OffsetDateTime;
use type_system::{
    url::{BaseUrl, VersionedUrl},
    DataTypeReference, EntityTypeReference, PropertyTypeReference,
};

pub use self::{
    data_type::DataTypeWithMetadata,
    entity_type::{EntityTypeMetadata, EntityTypeWithMetadata, PartialEntityTypeMetadata},
    property_type::PropertyTypeWithMetadata,
};
use crate::provenance::{OwnedById, ProvenanceMetadata};

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[repr(transparent)]
pub struct OntologyTypeVersion(u32);

impl OntologyTypeVersion {
    #[must_use]
    pub const fn new(inner: u32) -> Self {
        Self(inner)
    }

    #[must_use]
    pub const fn inner(self) -> u32 {
        self.0
    }
}

#[cfg(feature = "postgres")]
impl ToSql for OntologyTypeVersion {
    postgres_types::accepts!(INT8);

    postgres_types::to_sql_checked!();

    fn to_sql(&self, _: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        i64::from(self.0).to_sql(&Type::INT8, out)
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for OntologyTypeVersion {
    postgres_types::accepts!(INT8);

    fn from_sql(_: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self::new(i64::from_sql(&Type::INT8, raw)?.try_into()?))
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct OntologyTypeRecordId {
    #[cfg_attr(feature = "utoipa", schema(value_type = String))]
    pub base_url: BaseUrl,
    #[cfg_attr(feature = "utoipa", schema(value_type = u32))]
    pub version: OntologyTypeVersion,
}

impl fmt::Display for OntologyTypeRecordId {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}v/{}", self.base_url.as_str(), self.version.inner())
    }
}

impl From<VersionedUrl> for OntologyTypeRecordId {
    fn from(versioned_url: VersionedUrl) -> Self {
        Self {
            base_url: versioned_url.base_url,
            version: OntologyTypeVersion::new(versioned_url.version),
        }
    }
}

impl From<OntologyTypeRecordId> for VersionedUrl {
    fn from(record_id: OntologyTypeRecordId) -> Self {
        Self {
            base_url: record_id.base_url,
            version: record_id.version.inner(),
        }
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OntologyTemporalMetadata {
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

/// A [`CustomOntologyMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PartialCustomOntologyMetadata {
    Owned { owned_by_id: OwnedById },
    External { fetched_at: OffsetDateTime },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct OntologyElementMetadata {
    pub record_id: OntologyTypeRecordId,
    pub custom: CustomOntologyMetadata,
}

// TODO: Restrict mutable access when `#[feature(mut_restriction)]` is available.
//   see https://github.com/rust-lang/rust/issues/105077
//   see https://app.asana.com/0/0/1203977361907407/f
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum CustomOntologyMetadata {
    #[cfg_attr(
        feature = "utoipa",
        schema(title = "CustomOwnedOntologyElementMetadata")
    )]
    #[serde(rename_all = "camelCase")]
    Owned {
        provenance: ProvenanceMetadata,
        temporal_versioning: OntologyTemporalMetadata,
        owned_by_id: OwnedById,
    },
    #[cfg_attr(
        feature = "utoipa",
        schema(title = "CustomExternalOntologyElementMetadata")
    )]
    #[serde(rename_all = "camelCase")]
    External {
        provenance: ProvenanceMetadata,
        temporal_versioning: OntologyTemporalMetadata,
        #[cfg_attr(feature = "utoipa", schema(value_type = String))]
        #[serde(with = "temporal_versioning::serde::time")]
        fetched_at: OffsetDateTime,
    },
}

/// An [`OntologyElementMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialOntologyElementMetadata {
    pub record_id: OntologyTypeRecordId,
    pub custom: PartialCustomOntologyMetadata,
}

impl OntologyElementMetadata {
    #[must_use]
    pub fn from_partial(
        partial: PartialOntologyElementMetadata,
        provenance: ProvenanceMetadata,
        transaction_time: LeftClosedTemporalInterval<TransactionTime>,
    ) -> Self {
        Self {
            record_id: partial.record_id,
            custom: match partial.custom {
                PartialCustomOntologyMetadata::Owned { owned_by_id } => {
                    CustomOntologyMetadata::Owned {
                        provenance,
                        temporal_versioning: OntologyTemporalMetadata { transaction_time },
                        owned_by_id,
                    }
                }
                PartialCustomOntologyMetadata::External { fetched_at } => {
                    CustomOntologyMetadata::External {
                        provenance,
                        temporal_versioning: OntologyTemporalMetadata { transaction_time },
                        fetched_at,
                    }
                }
            },
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[allow(clippy::enum_variant_names)]
pub enum OntologyTypeReference<'a> {
    EntityTypeReference(&'a EntityTypeReference),
    PropertyTypeReference(&'a PropertyTypeReference),
    DataTypeReference(&'a DataTypeReference),
}

impl OntologyTypeReference<'_> {
    #[must_use]
    pub const fn url(&self) -> &VersionedUrl {
        match self {
            Self::EntityTypeReference(entity_type_ref) => entity_type_ref.url(),
            Self::PropertyTypeReference(property_type_ref) => property_type_ref.url(),
            Self::DataTypeReference(data_type_ref) => data_type_ref.url(),
        }
    }
}

pub trait OntologyType {
    type Metadata;

    fn id(&self) -> &VersionedUrl;

    fn traverse_references(&self) -> Vec<OntologyTypeReference>;
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OntologyTypeWithMetadata<S: OntologyType> {
    pub schema: S,
    pub metadata: S::Metadata,
}
