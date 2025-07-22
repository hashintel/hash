use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hash_graph_types::Embedding;
use serde::{Deserialize, Serialize};
use type_system::ontology::{
    OntologyTypeSchema, VersionedUrl, data_type::DataType, entity_type::EntityType,
    property_type::PropertyType,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound(
        serialize = "T: Serialize, T::Metadata: Serialize",
        deserialize = "T: Deserialize<'de>, T::Metadata: Deserialize<'de>"
    )
)]
pub struct OntologyTypeSnapshotRecord<T: OntologyTypeSchema> {
    pub schema: T,
    pub metadata: T::Metadata,
}

pub type DataTypeSnapshotRecord = OntologyTypeSnapshotRecord<DataType>;
pub type PropertyTypeSnapshotRecord = OntologyTypeSnapshotRecord<PropertyType>;
pub type EntityTypeSnapshotRecord = OntologyTypeSnapshotRecord<EntityType>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTypeEmbeddingRecord {
    pub data_type_id: VersionedUrl,
    pub embedding: Embedding<'static>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyTypeEmbeddingRecord {
    pub property_type_id: VersionedUrl,
    pub embedding: Embedding<'static>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeEmbeddingRecord {
    pub entity_type_id: VersionedUrl,
    pub embedding: Embedding<'static>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}
