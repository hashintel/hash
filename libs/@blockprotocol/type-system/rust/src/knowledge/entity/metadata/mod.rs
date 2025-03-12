mod diff;

use std::collections::HashSet;

use hash_graph_temporal_versioning::{DecisionTime, LeftClosedTemporalInterval, TransactionTime};

pub use self::diff::EntityTypeIdDiff;
use super::{EntityProvenance, id::EntityRecordId};
use crate::{
    knowledge::{Confidence, property::metadata::PropertyMetadataObject},
    ontology::VersionedUrl,
};

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityMetadata {
    pub record_id: EntityRecordId,
    pub temporal_versioning: EntityTemporalMetadata,
    #[cfg_attr(feature = "utoipa", schema(value_type = Vec<VersionedUrl>))]
    pub entity_type_ids: HashSet<VersionedUrl>,
    pub archived: bool,
    pub provenance: EntityProvenance,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<Confidence>,
    #[serde(default, skip_serializing_if = "PropertyMetadataObject::is_empty")]
    pub properties: PropertyMetadataObject,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTemporalMetadata {
    pub decision_time: LeftClosedTemporalInterval<DecisionTime>,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}
