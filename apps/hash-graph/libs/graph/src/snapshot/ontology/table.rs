use graph_types::{ontology::OntologyEditionProvenanceMetadata, owned_by_id::OwnedById, Embedding};
use postgres_types::{Json, ToSql};
use temporal_versioning::{LeftClosedTemporalInterval, Timestamp, TransactionTime};
use time::OffsetDateTime;
use type_system::{
    url::{BaseUrl, OntologyTypeVersion},
    ClosedEntityType, DataType, EntityType, PropertyType,
};
use uuid::Uuid;

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_ids")]
pub struct OntologyIdRow {
    pub ontology_id: Uuid,
    pub base_url: BaseUrl,
    pub version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_owned_metadata")]
pub struct OntologyOwnedMetadataRow {
    pub ontology_id: Uuid,
    pub web_id: OwnedById,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_external_metadata")]
pub struct OntologyExternalMetadataRow {
    pub ontology_id: Uuid,
    pub fetched_at: OffsetDateTime,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_temporal_metadata")]
pub struct OntologyTemporalMetadataRow {
    pub ontology_id: Uuid,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
    pub provenance: OntologyEditionProvenanceMetadata,
}

#[derive(Debug, ToSql)]
#[postgres(name = "data_types")]
pub struct DataTypeRow {
    pub ontology_id: Uuid,
    pub schema: Json<DataType>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "data_type_embeddings_tmp")]
pub struct DataTypeEmbeddingRow {
    pub ontology_id: Uuid,
    pub embedding: Embedding<'static>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_types")]
pub struct PropertyTypeRow {
    pub ontology_id: Uuid,
    pub schema: Json<PropertyType>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_type_constrains_values_on_tmp")]
pub struct PropertyTypeConstrainsValuesOnRow {
    pub source_property_type_ontology_id: Uuid,
    pub target_data_type_base_url: BaseUrl,
    pub target_data_type_version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_type_embeddings_tmp")]
pub struct PropertyTypeEmbeddingRow {
    pub ontology_id: Uuid,
    pub embedding: Embedding<'static>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_type_constrains_properties_on_tmp")]
pub struct PropertyTypeConstrainsPropertiesOnRow {
    pub source_property_type_ontology_id: Uuid,
    pub target_property_type_base_url: BaseUrl,
    pub target_property_type_version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_types")]
pub struct EntityTypeRow {
    pub ontology_id: Uuid,
    pub schema: Json<EntityType>,
    pub closed_schema: Json<ClosedEntityType>,
    pub label_property: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_embeddings_tmp")]
pub struct EntityTypeEmbeddingRow {
    pub ontology_id: Uuid,
    pub embedding: Embedding<'static>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_constrains_properties_on_tmp")]
pub struct EntityTypeConstrainsPropertiesOnRow {
    pub source_entity_type_ontology_id: Uuid,
    pub target_property_type_base_url: BaseUrl,
    pub target_property_type_version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_inherits_from_tmp")]
pub struct EntityTypeInheritsFromRow {
    pub source_entity_type_ontology_id: Uuid,
    pub target_entity_type_base_url: BaseUrl,
    pub target_entity_type_version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_constrains_links_on_tmp")]
pub struct EntityTypeConstrainsLinksOnRow {
    pub source_entity_type_ontology_id: Uuid,
    pub target_entity_type_base_url: BaseUrl,
    pub target_entity_type_version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_constrains_link_destinations_on_tmp")]
pub struct EntityTypeConstrainsLinkDestinationsOnRow {
    pub source_entity_type_ontology_id: Uuid,
    pub target_entity_type_base_url: BaseUrl,
    pub target_entity_type_version: OntologyTypeVersion,
}
