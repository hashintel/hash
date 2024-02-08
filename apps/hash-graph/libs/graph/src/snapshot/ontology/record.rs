use authorization::schema::{
    DataTypeRelationAndSubject, EntityTypeRelationAndSubject, PropertyTypeRelationAndSubject,
};
use graph_types::{ontology::OntologyType, Embedding};
use serde::{Deserialize, Serialize};
use temporal_versioning::{Timestamp, TransactionTime};
use type_system::{url::VersionedUrl, DataType, EntityType, PropertyType};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound(
        serialize = "T: Serialize, T::Metadata: Serialize, R: Serialize",
        deserialize = "T: Deserialize<'de>, T::Metadata: Deserialize<'de>, R: Deserialize<'de>"
    )
)]
pub struct OntologyTypeSnapshotRecord<T: OntologyType, R> {
    pub schema: T,
    pub metadata: T::Metadata,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub relations: Vec<R>,
}

pub type DataTypeSnapshotRecord = OntologyTypeSnapshotRecord<DataType, DataTypeRelationAndSubject>;
pub type PropertyTypeSnapshotRecord =
    OntologyTypeSnapshotRecord<PropertyType, PropertyTypeRelationAndSubject>;
pub type EntityTypeSnapshotRecord =
    OntologyTypeSnapshotRecord<EntityType, EntityTypeRelationAndSubject>;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTypeEmbeddingRecord {
    pub data_type_id: VersionedUrl,
    pub embedding: Embedding<'static>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyTypeEmbeddingRecord {
    pub property_type_id: VersionedUrl,
    pub embedding: Embedding<'static>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeEmbeddingRecord {
    pub entity_type_id: VersionedUrl,
    pub embedding: Embedding<'static>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}
