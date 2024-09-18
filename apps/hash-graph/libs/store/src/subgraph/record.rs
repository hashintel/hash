use graph_types::{
    knowledge::entity::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
};
use temporal_versioning::{ClosedTemporalBound, TemporalTagged, TimeAxis};

use crate::subgraph::identifier::{
    DataTypeVertexId, EntityTypeVertexId, EntityVertexId, PropertyTypeVertexId, VertexId,
};

pub trait SubgraphRecord {
    type VertexId: VertexId<Record = Self> + Send + Sync;

    fn vertex_id(&self, time_axis: TimeAxis) -> Self::VertexId;
}

impl SubgraphRecord for Entity {
    type VertexId = EntityVertexId;

    #[must_use]
    fn vertex_id(&self, time_axis: TimeAxis) -> EntityVertexId {
        let ClosedTemporalBound::Inclusive(timestamp) = match time_axis {
            TimeAxis::DecisionTime => self
                .metadata
                .temporal_versioning
                .decision_time
                .start()
                .cast(),
            TimeAxis::TransactionTime => self
                .metadata
                .temporal_versioning
                .transaction_time
                .start()
                .cast(),
        };
        EntityVertexId {
            base_id: self.metadata.record_id.entity_id,
            revision_id: timestamp,
        }
    }
}

impl SubgraphRecord for DataTypeWithMetadata {
    type VertexId = DataTypeVertexId;

    #[must_use]
    fn vertex_id(&self, _time_axis: TimeAxis) -> DataTypeVertexId {
        let record_id = &self.metadata.record_id;
        DataTypeVertexId {
            base_id: record_id.base_url.clone(),
            revision_id: record_id.version,
        }
    }
}

impl SubgraphRecord for PropertyTypeWithMetadata {
    type VertexId = PropertyTypeVertexId;

    #[must_use]
    fn vertex_id(&self, _time_axis: TimeAxis) -> PropertyTypeVertexId {
        let record_id = &self.metadata.record_id;
        PropertyTypeVertexId {
            base_id: record_id.base_url.clone(),
            revision_id: record_id.version,
        }
    }
}

impl SubgraphRecord for EntityTypeWithMetadata {
    type VertexId = EntityTypeVertexId;

    #[must_use]
    fn vertex_id(&self, _time_axis: TimeAxis) -> EntityTypeVertexId {
        let record_id = &self.metadata.record_id;
        EntityTypeVertexId {
            base_id: record_id.base_url.clone(),
            revision_id: record_id.version,
        }
    }
}
