use graph_types::{
    Embedding,
    account::{AccountGroupId, AccountId},
    knowledge::{
        Confidence,
        entity::{
            DraftId, EntityEditionId, EntityEditionProvenance, EntityUuid, InferredEntityProvenance,
        },
        property::{PropertyMetadataObject, PropertyObject, PropertyProvenance},
    },
    ontology::OntologyEditionProvenance,
    owned_by_id::OwnedById,
};
use postgres_types::ToSql;
use temporal_versioning::{DecisionTime, LeftClosedTemporalInterval, Timestamp, TransactionTime};
use time::OffsetDateTime;
use type_system::{
    Valid,
    schema::{
        ClosedDataType, ClosedEntityType, ConversionDefinition, DataType, DataTypeUuid, EntityType,
        EntityTypeUuid, InheritanceDepth, OntologyTypeUuid, PropertyType, PropertyTypeUuid,
    },
    url::{BaseUrl, OntologyTypeVersion},
};

use crate::store::postgres::query::Table;

pub trait PostgresRow: ToSql + Sized {
    fn table() -> Table;
}

#[derive(Debug, ToSql)]
#[postgres(name = "account_groups")]
pub struct AccountGroupRow {
    pub account_group_id: AccountGroupId,
}

#[derive(Debug, ToSql)]
#[postgres(name = "accounts")]
pub struct AccountRow {
    pub account_id: AccountId,
}

#[derive(Debug, ToSql)]
#[postgres(name = "base_urls")]
pub struct BaseUrlRow {
    pub base_url: BaseUrl,
}

#[derive(Debug, ToSql)]
#[postgres(name = "data_type_embeddings")]
pub struct DataTypeEmbeddingRow<'e> {
    pub ontology_id: DataTypeUuid,
    pub embedding: Embedding<'e>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "data_type_conversions")]
pub struct DataTypeConversionsRow {
    pub source_data_type_ontology_id: DataTypeUuid,
    pub target_data_type_base_url: BaseUrl,
    pub from: ConversionDefinition,
    pub into: ConversionDefinition,
}

#[derive(Debug, ToSql)]
#[postgres(name = "data_types")]
pub struct DataTypeRow {
    pub ontology_id: DataTypeUuid,
    pub schema: Valid<DataType>,
    pub closed_schema: Valid<ClosedDataType>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_drafts")]
pub struct EntityDraftRow {
    pub web_id: OwnedById,
    pub entity_uuid: EntityUuid,
    pub draft_id: DraftId,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_editions")]
pub struct EntityEditionRow {
    pub entity_edition_id: EntityEditionId,
    pub properties: PropertyObject,
    pub archived: bool,
    pub confidence: Option<Confidence>,
    pub provenance: EntityEditionProvenance,
    pub property_metadata: PropertyMetadataObject,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_embeddings")]
pub struct EntityEmbeddingRow {
    pub web_id: OwnedById,
    pub entity_uuid: EntityUuid,
    pub draft_id: Option<DraftId>,
    pub property: Option<String>,
    pub embedding: Embedding<'static>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
    pub updated_at_decision_time: Timestamp<DecisionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_has_left_entity")]
pub struct EntityHasLeftEntityRow {
    pub web_id: OwnedById,
    pub entity_uuid: EntityUuid,
    pub left_web_id: OwnedById,
    pub left_entity_uuid: EntityUuid,
    pub confidence: Option<Confidence>,
    pub provenance: PropertyProvenance,
}

impl PostgresRow for EntityHasLeftEntityRow {
    fn table() -> Table {
        Table::EntityHasLeftEntity
    }
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_has_right_entity")]
pub struct EntityHasRightEntityRow {
    pub web_id: OwnedById,
    pub entity_uuid: EntityUuid,
    pub right_web_id: OwnedById,
    pub right_entity_uuid: EntityUuid,
    pub confidence: Option<Confidence>,
    pub provenance: PropertyProvenance,
}

impl PostgresRow for EntityHasRightEntityRow {
    fn table() -> Table {
        Table::EntityHasRightEntity
    }
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_ids")]
pub struct EntityIdRow {
    pub web_id: OwnedById,
    pub entity_uuid: EntityUuid,
    pub provenance: InferredEntityProvenance,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_is_of_type")]
pub struct EntityIsOfTypeRow {
    pub entity_edition_id: EntityEditionId,
    pub entity_type_ontology_id: EntityTypeUuid,
    pub inheritance_depth: InheritanceDepth,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_temporal_metadata")]
pub struct EntityTemporalMetadataRow {
    pub web_id: OwnedById,
    pub entity_uuid: EntityUuid,
    pub draft_id: Option<DraftId>,
    pub entity_edition_id: EntityEditionId,
    pub decision_time: LeftClosedTemporalInterval<DecisionTime>,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_constrains_link_destinations_on")]
pub struct EntityTypeConstrainsLinkDestinationsOnRow {
    pub source_entity_type_ontology_id: EntityTypeUuid,
    pub target_entity_type_ontology_id: EntityTypeUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_constrains_links_on")]
pub struct EntityTypeConstrainsLinksOnRow {
    pub source_entity_type_ontology_id: EntityTypeUuid,
    pub target_entity_type_ontology_id: EntityTypeUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_constrains_properties_on")]
pub struct EntityTypeConstrainsPropertiesOnRow {
    pub source_entity_type_ontology_id: EntityTypeUuid,
    pub target_property_type_ontology_id: PropertyTypeUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_embeddings")]
pub struct EntityTypeEmbeddingRow<'e> {
    pub ontology_id: EntityTypeUuid,
    pub embedding: Embedding<'e>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_inherits_from")]
pub struct EntityTypeInheritsFromRow {
    pub source_entity_type_ontology_id: EntityTypeUuid,
    pub target_entity_type_ontology_id: EntityTypeUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_types")]
pub struct EntityTypeRow {
    pub ontology_id: EntityTypeUuid,
    pub schema: Valid<EntityType>,
    pub closed_schema: Valid<ClosedEntityType>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_ids")]
pub struct OntologyIdRow {
    pub ontology_id: OntologyTypeUuid,
    pub base_url: BaseUrl,
    pub version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_owned_metadata")]
pub struct OntologyOwnedMetadataRow {
    pub ontology_id: OntologyTypeUuid,
    pub web_id: OwnedById,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_external_metadata")]
pub struct OntologyExternalMetadataRow {
    pub ontology_id: OntologyTypeUuid,
    pub fetched_at: OffsetDateTime,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_temporal_metadata")]
pub struct OntologyTemporalMetadataRow {
    pub ontology_id: OntologyTypeUuid,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
    pub provenance: OntologyEditionProvenance,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_types")]
pub struct PropertyTypeRow {
    pub ontology_id: PropertyTypeUuid,
    pub schema: Valid<PropertyType>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_type_constrains_values_on")]
pub struct PropertyTypeConstrainsValuesOnRow {
    pub source_property_type_ontology_id: PropertyTypeUuid,
    pub target_data_type_ontology_id: DataTypeUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_type_embeddings")]
pub struct PropertyTypeEmbeddingRow<'e> {
    pub ontology_id: PropertyTypeUuid,
    pub embedding: Embedding<'e>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_type_constrains_properties_on")]
pub struct PropertyTypeConstrainsPropertiesOnRow {
    pub source_property_type_ontology_id: PropertyTypeUuid,
    pub target_property_type_ontology_id: PropertyTypeUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "webs")]
pub struct WebRow {
    pub web_id: OwnedById,
}
