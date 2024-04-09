use serde::{Deserialize, Serialize};
use temporal_versioning::{DecisionTime, Timestamp, TransactionTime};

use crate::account::{CreatedById, EditionCreatedById};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityEditionProvenanceMetadata {
    pub created_by_id: EditionCreatedById,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityProvenanceMetadata {
    pub created_by_id: CreatedById,
    pub created_at_transaction_time: Timestamp<TransactionTime>,
    pub created_at_decision_time: Timestamp<DecisionTime>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_transaction_time: Option<Timestamp<TransactionTime>>,
    #[cfg_attr(feature = "utoipa", schema(nullable = false))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_non_draft_created_at_decision_time: Option<Timestamp<DecisionTime>>,
    pub edition: EntityEditionProvenanceMetadata,
}
