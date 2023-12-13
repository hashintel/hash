use graph_types::knowledge::entity::EntityId;
use serde::{Deserialize, Serialize};
use temporal_versioning::LeftClosedTemporalInterval;
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

use crate::subgraph::temporal_axes::VariableAxis;

pub trait EdgeEndpoint {
    type BaseId;
    type RevisionId;

    fn base_id(&self) -> &Self::BaseId;
    fn revision_id(&self) -> Self::RevisionId;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
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
