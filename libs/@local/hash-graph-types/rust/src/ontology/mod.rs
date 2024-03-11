mod data_type;
mod entity_type;
mod property_type;

use core::fmt;

use serde::{Deserialize, Serialize};
use temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};
use time::OffsetDateTime;
use type_system::{
    url::{BaseUrl, OntologyTypeVersion, VersionedUrl},
    DataTypeReference, EntityTypeReference, PropertyTypeReference,
};

pub use self::{
    data_type::{DataTypeMetadata, DataTypeWithMetadata, PartialDataTypeMetadata},
    entity_type::{
        EntityTypeEmbedding, EntityTypeMetadata, EntityTypeWithMetadata, PartialEntityTypeMetadata,
    },
    property_type::{
        PartialPropertyTypeMetadata, PropertyTypeEmbedding, PropertyTypeMetadata,
        PropertyTypeWithMetadata,
    },
};
use crate::{
    account::{EditionArchivedById, EditionCreatedById},
    owned_by_id::OwnedById,
};

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
            version: versioned_url.version,
        }
    }
}

impl From<OntologyTypeRecordId> for VersionedUrl {
    fn from(record_id: OntologyTypeRecordId) -> Self {
        Self {
            base_url: record_id.base_url,
            version: record_id.version,
        }
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OntologyTemporalMetadata {
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OntologyProvenanceMetadata {
    pub edition: OntologyEditionProvenanceMetadata,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OntologyEditionProvenanceMetadata {
    pub created_by_id: EditionCreatedById,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by_id: Option<EditionArchivedById>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum OntologyTypeClassificationMetadata {
    #[serde(rename_all = "camelCase")]
    Owned { owned_by_id: OwnedById },
    #[serde(rename_all = "camelCase")]
    External {
        #[serde(with = "temporal_versioning::serde::time")]
        fetched_at: OffsetDateTime,
    },
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

#[derive(Debug)]
#[allow(clippy::enum_variant_names)]
pub enum OntologyTypeMetadata {
    DataType(DataTypeMetadata),
    PropertyType(PropertyTypeMetadata),
    EntityType(EntityTypeMetadata),
}

impl OntologyTypeMetadata {
    #[must_use]
    pub const fn record_id(&self) -> &OntologyTypeRecordId {
        match self {
            Self::DataType(metadata) => &metadata.record_id,
            Self::PropertyType(metadata) => &metadata.record_id,
            Self::EntityType(metadata) => &metadata.record_id,
        }
    }

    #[must_use]
    pub const fn classification(&self) -> &OntologyTypeClassificationMetadata {
        match self {
            Self::DataType(metadata) => &metadata.classification,
            Self::PropertyType(metadata) => &metadata.classification,
            Self::EntityType(metadata) => &metadata.classification,
        }
    }

    #[must_use]
    pub const fn temporal_versioning(&self) -> &OntologyTemporalMetadata {
        match self {
            Self::DataType(metadata) => &metadata.temporal_versioning,
            Self::PropertyType(metadata) => &metadata.temporal_versioning,
            Self::EntityType(metadata) => &metadata.temporal_versioning,
        }
    }

    #[must_use]
    pub const fn provenance(&self) -> &OntologyProvenanceMetadata {
        match self {
            Self::DataType(metadata) => &metadata.provenance,
            Self::PropertyType(metadata) => &metadata.provenance,
            Self::EntityType(metadata) => &metadata.provenance,
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
