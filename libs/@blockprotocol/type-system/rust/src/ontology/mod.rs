use hash_graph_temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};

use self::provenance::{OntologyOwnership, OntologyProvenance};
use crate::{
    schema::{
        DataTypeMetadata, DataTypeReference, EntityTypeMetadata, EntityTypeReference,
        PropertyTypeMetadata, PropertyTypeReference,
    },
    url::{OntologyTypeRecordId, VersionedUrl},
};

pub mod provenance;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[expect(clippy::enum_variant_names)]
pub enum OntologyTypeReference<'a> {
    EntityTypeReference(&'a EntityTypeReference),
    PropertyTypeReference(&'a PropertyTypeReference),
    DataTypeReference(&'a DataTypeReference),
}

impl OntologyTypeReference<'_> {
    #[must_use]
    pub const fn url(&self) -> &VersionedUrl {
        match self {
            Self::EntityTypeReference(entity_type_ref) => &entity_type_ref.url,
            Self::PropertyTypeReference(property_type_ref) => &property_type_ref.url,
            Self::DataTypeReference(data_type_ref) => &data_type_ref.url,
        }
    }
}

pub trait OntologyTypeSchema {
    type Metadata;

    fn id(&self) -> &VersionedUrl;

    fn references(&self) -> Vec<OntologyTypeReference>;
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OntologyTypeWithMetadata<S: OntologyTypeSchema> {
    pub schema: S,
    pub metadata: S::Metadata,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OntologyTemporalMetadata {
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

#[derive(Debug)]
#[expect(clippy::enum_variant_names)]
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
    pub const fn ownership(&self) -> &OntologyOwnership {
        match self {
            Self::DataType(metadata) => &metadata.ownership,
            Self::PropertyType(metadata) => &metadata.ownership,
            Self::EntityType(metadata) => &metadata.ownership,
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
    pub const fn provenance(&self) -> &OntologyProvenance {
        match self {
            Self::DataType(metadata) => &metadata.provenance,
            Self::PropertyType(metadata) => &metadata.provenance,
            Self::EntityType(metadata) => &metadata.provenance,
        }
    }
}
