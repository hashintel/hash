use postgres_types::ToSql;

use crate::{
    identifier::{
        knowledge::EntityEditionId,
        ontology::OntologyTypeVersion,
        time::{DecisionTime, LeftClosedTemporalInterval, TransactionTime},
    },
    knowledge::{EntityProperties, EntityUuid, LinkOrder},
    provenance::{OwnedById, RecordCreatedById},
};

#[derive(Debug, ToSql)]
#[postgres(name = "entity_ids")]
pub struct EntityIdRow {
    pub owned_by_id: OwnedById,
    pub entity_uuid: EntityUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_editions_tmp")]
pub struct EntityEditionRow {
    pub entity_edition_id: EntityEditionId,
    pub properties: EntityProperties,
    pub left_to_right_order: Option<LinkOrder>,
    pub right_to_left_order: Option<LinkOrder>,
    pub record_created_by_id: RecordCreatedById,
    pub archived: bool,
    pub entity_type_base_url: String,
    pub entity_type_version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_temporal_metadata")]
pub struct EntityTemporalMetadataRow {
    pub owned_by_id: OwnedById,
    pub entity_uuid: EntityUuid,
    pub entity_edition_id: EntityEditionId,
    pub decision_time: LeftClosedTemporalInterval<DecisionTime>,
    pub transaction_time: Option<LeftClosedTemporalInterval<TransactionTime>>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_link_edges_tmp")]
pub struct EntityLinkEdgeRow {
    pub owned_by_id: OwnedById,
    pub entity_uuid: EntityUuid,
    pub left_owned_by_id: OwnedById,
    pub left_entity_uuid: EntityUuid,
    pub right_owned_by_id: OwnedById,
    pub right_entity_uuid: EntityUuid,
}
