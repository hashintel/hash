use postgres_types::{Json, ToSql};
use time::OffsetDateTime;
use type_system::repr;
use uuid::Uuid;

use crate::{
    identifier::{
        ontology::OntologyTypeVersion,
        time::{LeftClosedTemporalInterval, TransactionTime},
    },
    provenance::{OwnedById, RecordCreatedById},
};

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_ids")]
pub struct OntologyIdRow {
    pub ontology_id: Uuid,
    pub base_url: String,
    pub version: OntologyTypeVersion,
    pub transaction_time: Option<LeftClosedTemporalInterval<TransactionTime>>,
    pub record_created_by_id: RecordCreatedById,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_owned_metadata")]
pub struct OntologyOwnedMetadataRow {
    pub ontology_id: Uuid,
    pub owned_by_id: OwnedById,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_external_metadata")]
pub struct OntologyExternalMetadataRow {
    pub ontology_id: Uuid,
    pub fetched_at: OffsetDateTime,
}

#[derive(Debug, ToSql)]
#[postgres(name = "data_types")]
pub struct DataTypeRow {
    pub ontology_id: Uuid,
    pub schema: Json<repr::DataType>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_types")]
pub struct PropertyTypeRow {
    pub ontology_id: Uuid,
    pub schema: Json<repr::PropertyType>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_type_constrains_values_on_tmp")]
pub struct PropertyTypeConstrainsValuesOnRow {
    pub source_property_type_ontology_id: Uuid,
    pub target_data_type_base_url: String,
    pub target_data_type_version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_type_constrains_properties_on_tmp")]
pub struct PropertyTypeConstrainsPropertiesOnRow {
    pub source_property_type_ontology_id: Uuid,
    pub target_property_type_base_url: String,
    pub target_property_type_version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_types")]
pub struct EntityTypeRow {
    pub ontology_id: Uuid,
    pub schema: Json<repr::EntityType>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_constrains_properties_on_tmp")]
pub struct EntityTypeConstrainsPropertiesOnRow {
    pub source_entity_type_ontology_id: Uuid,
    pub target_property_type_base_url: String,
    pub target_property_type_version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_inherits_from_tmp")]
pub struct EntityTypeInheritsFromRow {
    pub source_entity_type_ontology_id: Uuid,
    pub target_entity_type_base_url: String,
    pub target_entity_type_version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_constrains_links_on_tmp")]
pub struct EntityTypeConstrainsLinksOnRow {
    pub source_entity_type_ontology_id: Uuid,
    pub target_entity_type_base_url: String,
    pub target_entity_type_version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_constrains_link_destinations_on_tmp")]
pub struct EntityTypeConstrainsLinkDestinationsOnRow {
    pub source_entity_type_ontology_id: Uuid,
    pub target_entity_type_base_url: String,
    pub target_entity_type_version: OntologyTypeVersion,
}
