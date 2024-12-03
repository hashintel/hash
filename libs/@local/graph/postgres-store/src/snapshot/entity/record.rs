use hash_graph_authorization::schema::EntityRelationAndSubject;
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use hash_graph_types::{
    Embedding,
    knowledge::{
        entity::{EntityId, EntityMetadata, EntityUuid},
        link::LinkData,
        property::PropertyObject,
    },
};
use serde::{Deserialize, Serialize};
use type_system::url::BaseUrl;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntitySnapshotRecord {
    pub properties: PropertyObject,
    pub metadata: EntityMetadata,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link_data: Option<LinkData>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityRelationRecord {
    pub entity_uuid: EntityUuid,
    pub relation: EntityRelationAndSubject,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityEmbeddingRecord {
    pub entity_id: EntityId,
    pub embedding: Embedding<'static>,
    pub property: Option<BaseUrl>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
    pub updated_at_decision_time: Timestamp<DecisionTime>,
}
