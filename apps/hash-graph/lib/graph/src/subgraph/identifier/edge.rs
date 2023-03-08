use serde::{Deserialize, Serialize};
use type_system::url::BaseUrl;
use utoipa::ToSchema;

use crate::{
    identifier::{
        knowledge::EntityId, ontology::OntologyTypeVersion, time::LeftClosedTemporalInterval,
    },
    subgraph::{identifier::OntologyTypeVertexId, temporal_axes::VariableAxis},
};

pub trait EdgeEndpoint {
    type BaseId;
    type RightEndpoint;

    fn base_id(&self) -> &Self::BaseId;
    fn revision_id(&self) -> Self::RightEndpoint;
}

impl EdgeEndpoint for OntologyTypeVertexId {
    type BaseId = BaseUrl;
    type RightEndpoint = OntologyTypeVersion;

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> Self::RightEndpoint {
        self.revision_id
    }
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
