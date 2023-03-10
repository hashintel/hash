use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    identifier::{knowledge::EntityId, time::LeftClosedTemporalInterval},
    subgraph::temporal_axes::VariableAxis,
};

pub trait EdgeEndpoint {
    type BaseId;
    type RevisionId;

    fn base_id(&self) -> &Self::BaseId;
    fn revision_id(&self) -> Self::RevisionId;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityIdWithInterval {
    pub entity_id: EntityId,
    pub interval: LeftClosedTemporalInterval<VariableAxis>,
}

impl EdgeEndpoint for EntityIdWithInterval {
    type BaseId = EntityId;
    type RevisionId = LeftClosedTemporalInterval<VariableAxis>;

    fn base_id(&self) -> &Self::BaseId {
        &self.entity_id
    }

    fn revision_id(&self) -> Self::RevisionId {
        self.interval
    }
}
