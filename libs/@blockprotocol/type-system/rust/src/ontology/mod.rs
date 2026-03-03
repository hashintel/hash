//! Ontology module containing type definitions and validation logic.
//!
//! The ontology module is the core of the Block Protocol Type System, providing:
//!
//! 1. Definitions for the core type abstractions (data, property, and entity types)
//! 2. JSON Schema integration for strongly typed ontology definitions
//! 3. Metadata structures for tracking type information
//! 4. Provenance tracking for type ownership and history
//! 5. Type ID management and versioning support
//!
//! This module defines the foundational types used throughout the system and
//! ensures consistent type validation across different contexts.

pub mod data_type;
pub mod entity_type;
pub mod id;
pub mod json_schema;
pub mod property_type;
pub mod provenance;

pub use self::id::{BaseUrl, VersionedUrl};

mod inheritance;

use hash_graph_temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};

pub use self::{
    data_type::DataTypeWithMetadata, entity_type::EntityTypeWithMetadata,
    inheritance::InheritanceDepth, property_type::PropertyTypeWithMetadata,
};
use self::{
    id::OntologyTypeRecordId,
    provenance::{OntologyOwnership, OntologyProvenance},
};
use crate::ontology::{
    data_type::{DataTypeMetadata, schema::DataTypeReference},
    entity_type::{EntityTypeMetadata, schema::EntityTypeReference},
    property_type::{PropertyTypeMetadata, schema::PropertyTypeReference},
};

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

    fn references(&self) -> Vec<OntologyTypeReference<'_>>;
}

#[derive(Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OntologyTypeWithMetadata<S: OntologyTypeSchema> {
    pub schema: S,
    pub metadata: S::Metadata,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OntologyTemporalMetadata {
    #[cfg_attr(target_arch = "wasm32", tsify(type = "LeftClosedTemporalInterval"))]
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
