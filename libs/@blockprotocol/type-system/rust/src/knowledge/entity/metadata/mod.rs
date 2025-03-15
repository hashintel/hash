//! Entity metadata that includes identity, provenance, type information, and temporal data.
//!
//! This module provides types for tracking comprehensive metadata about an entity in the knowledge
//! graph, including:
//! - Record identification
//! - Temporal versioning
//! - Type information
//! - Archival status
//! - Provenance tracking
//! - Confidence indicators
//! - Property-specific metadata

mod diff;

use std::collections::HashSet;

use hash_graph_temporal_versioning::{DecisionTime, LeftClosedTemporalInterval, TransactionTime};

pub use self::diff::EntityTypeIdDiff;
use super::{EntityProvenance, id::EntityRecordId};
use crate::{
    knowledge::{Confidence, property::metadata::PropertyObjectMetadata},
    ontology::VersionedUrl,
};

/// Comprehensive metadata for an entity in the knowledge graph.
///
/// [`EntityMetadata`] contains essential information about an entity beyond its properties,
/// including its identity, temporal versioning, type information, provenance, and confidence.
/// This metadata provides context for interpreting and validating the entity's properties.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityMetadata {
    /// Unique identifier for this entity record.
    pub record_id: EntityRecordId,

    /// Temporal versioning information for this entity.
    ///
    /// Tracks both the decision time (when the entity was decided to exist) and
    /// transaction time (when the entity was recorded in the system).
    pub temporal_versioning: EntityTemporalMetadata,

    /// The set of entity types this entity conforms to.
    ///
    /// Each entity must conform to at least one entity type, and may conform to multiple
    /// types simultaneously.
    #[cfg_attr(feature = "utoipa", schema(value_type = Vec<VersionedUrl>))]
    pub entity_type_ids: HashSet<VersionedUrl>,

    /// Whether this entity has been archived.
    ///
    /// Archived entities are generally not included in regular queries but remain
    /// in the system for historical purposes.
    ///
    /// Note, that this will be replaced by cutting off the temporal versioning interval at the
    /// current transaction time in the future. This is a stopgap measure to ensure that archived
    /// entities are possible at the time of writing.
    pub archived: bool,

    /// Provenance information tracking the origin and history of this entity.
    pub provenance: EntityProvenance,

    /// Optional confidence score for this entity.
    ///
    /// Indicates the system's confidence in the correctness or relevance of this entity.
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,

    /// Metadata specific to the entity's properties.
    ///
    /// Contains structured metadata that corresponds to the structure of the entity's properties,
    /// including property-specific provenance and confidence information.
    #[serde(default, skip_serializing_if = "PropertyObjectMetadata::is_empty")]
    pub properties: PropertyObjectMetadata,
}

/// Temporal metadata for tracking entity versions over time.
///
/// [`EntityTemporalMetadata`] tracks two distinct time dimensions:
/// - Decision time: When the entity was decided to exist in the real world
/// - Transaction time: When the entity was recorded in the system
///
/// This bi-temporal approach allows precise tracking of when information was known
/// versus when it was recorded, enabling accurate historical queries.
#[derive(Debug, Clone, Hash, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTemporalMetadata {
    /// The interval during which this entity version was decided to be inserted or considered
    /// relevant by the decision maker.
    #[cfg_attr(target_arch = "wasm32", tsify(type = "LeftClosedTemporalInterval"))]
    pub decision_time: LeftClosedTemporalInterval<DecisionTime>,

    /// The interval during which this entity version was recorded in the system.
    #[cfg_attr(target_arch = "wasm32", tsify(type = "LeftClosedTemporalInterval"))]
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}
