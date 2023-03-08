use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::identifier::{
    knowledge::EntityId,
    time::{LeftClosedTemporalInterval, VariableAxis},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityIdWithInterval {
    pub entity_id: EntityId,
    pub interval: LeftClosedTemporalInterval<VariableAxis>,
}
