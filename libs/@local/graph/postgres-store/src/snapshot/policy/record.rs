use hash_graph_authorization::policies::{
    Effect, PolicyId, principal::PrincipalConstraint, resource::ResourceConstraint,
};
use hash_graph_temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyActionSnapshotRecord {
    pub policy_id: PolicyId,
    pub name: String,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyEditionSnapshotRecord {
    pub id: PolicyId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub effect: Effect,
    pub principal: Option<PrincipalConstraint>,
    pub resource: Option<ResourceConstraint>,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}
