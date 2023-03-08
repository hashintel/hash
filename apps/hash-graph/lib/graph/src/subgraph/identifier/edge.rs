use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::identifier::{
    knowledge::EntityId,
    time::{LeftClosedTemporalInterval, VariableAxis},
};

pub trait EdgeEndpoint {
    type BaseId;
    type RightEndpoint;

    fn base_id(&self) -> &Self::BaseId;
    fn revision_id(&self) -> Self::RightEndpoint;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityIdWithInterval {
    pub entity_id: EntityId,
    pub interval: LeftClosedTemporalInterval<VariableAxis>,
}

impl EdgeEndpoint for EntityIdWithInterval {
    type BaseId = EntityId;
    type RightEndpoint = LeftClosedTemporalInterval<VariableAxis>;

    fn base_id(&self) -> &Self::BaseId {
        &self.entity_id
    }

    fn revision_id(&self) -> Self::RightEndpoint {
        self.interval
    }
}
