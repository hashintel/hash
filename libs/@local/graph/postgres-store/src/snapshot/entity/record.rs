use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use hash_graph_types::Embedding;
use serde::{Deserialize, Serialize};
use type_system::{knowledge::entity::EntityId, ontology::BaseUrl};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityEmbeddingRecord {
    pub entity_id: EntityId,
    pub embedding: Embedding<'static>,
    pub property: Option<BaseUrl>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
    pub updated_at_decision_time: Timestamp<DecisionTime>,
}
