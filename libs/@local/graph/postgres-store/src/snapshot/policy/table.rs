use hash_graph_authorization::policies::{Effect, PolicyId, resource::ResourceConstraint};
use hash_graph_temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};
use postgres_types::{Json, ToSql};
use type_system::principal::{PrincipalId, PrincipalType};

#[derive(Debug, ToSql)]
#[postgres(name = "policy")]
pub struct PolicyRow {
    pub id: PolicyId,
}

#[derive(Debug, ToSql)]
#[postgres(name = "policy_edition")]
pub struct PolicyEditionRow {
    pub id: PolicyId,
    pub name: Option<String>,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
    pub effect: Effect,
    pub principal_id: Option<PrincipalId>,
    pub principal_type: Option<PrincipalType>,
    pub actor_type: Option<PrincipalType>,
    pub resource_constraint: Option<Json<ResourceConstraint>>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "policy_action")]
pub struct PolicyActionRow {
    pub policy_id: PolicyId,
    pub action_name: String,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}
