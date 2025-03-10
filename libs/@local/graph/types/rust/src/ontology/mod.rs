mod data_type;
mod entity_type;
mod property_type;
mod provenance;

use core::{borrow::Borrow, error::Error};

use error_stack::Report;
use hash_graph_temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};
use serde::{Deserialize, Serialize};
use type_system::{
    ontology::provenance::OntologyOwnership,
    schema::{DataTypeReference, EntityTypeReference, PropertyTypeReference},
    url::{OntologyTypeRecordId, VersionedUrl},
};

pub use self::{
    data_type::{DataTypeLookup, DataTypeMetadata, DataTypeWithMetadata, PartialDataTypeMetadata},
    entity_type::{
        EntityTypeEmbedding, EntityTypeMetadata, EntityTypeWithMetadata, PartialEntityTypeMetadata,
    },
    property_type::{
        PartialPropertyTypeMetadata, PropertyTypeEmbedding, PropertyTypeMetadata,
        PropertyTypeWithMetadata,
    },
    provenance::{
        OntologyEditionProvenance, OntologyProvenance, ProvidedOntologyEditionProvenance,
    },
};

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OntologyTemporalMetadata {
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

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

pub trait OntologyTypeProvider<O> {
    type Value: Borrow<O> + Send;

    fn provide_type(
        &self,
        type_id: &VersionedUrl,
    ) -> impl Future<Output = Result<Self::Value, Report<impl Error + Send + Sync + 'static>>> + Send;
}

pub enum EntityTypeVariance {
    Covariant,
    Contravariant,
    Invariant,
}
