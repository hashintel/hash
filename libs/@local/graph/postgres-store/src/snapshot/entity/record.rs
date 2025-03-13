use hash_graph_authorization::schema::EntityRelationAndSubject;
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use hash_graph_types::Embedding;
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    ontology::BaseUrl,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityRelationRecord {
    pub entity_uuid: EntityUuid,
    pub relation: EntityRelationAndSubject,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityEmbeddingRecord {
    pub entity_id: EntityId,
    pub embedding: Embedding<'static>,
    pub property: Option<BaseUrl>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
    pub updated_at_decision_time: Timestamp<DecisionTime>,
}
