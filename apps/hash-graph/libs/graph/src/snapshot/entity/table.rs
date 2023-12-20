use graph_types::{
    account::EditionCreatedById,
    knowledge::{
        entity::{EntityEditionId, EntityProperties, EntityUuid},
        link::LinkOrder,
    },
    ontology::OntologyTypeVersion,
    owned_by_id::OwnedById,
};
use postgres_types::ToSql;
use temporal_versioning::{DecisionTime, LeftClosedTemporalInterval, TransactionTime};

#[derive(Debug, ToSql)]
#[postgres(name = "entity_ids")]
pub struct EntityIdRow {
    pub web_id: OwnedById,
    pub entity_uuid: EntityUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_editions_tmp")]
pub struct EntityEditionRow {
    pub entity_edition_id: EntityEditionId,
    pub properties: EntityProperties,
    pub left_to_right_order: Option<LinkOrder>,
    pub right_to_left_order: Option<LinkOrder>,
    pub edition_created_by_id: EditionCreatedById,
    pub archived: bool,
    pub draft: bool,
    pub entity_type_base_url: String,
    pub entity_type_version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_temporal_metadata")]
pub struct EntityTemporalMetadataRow {
    pub web_id: OwnedById,
    pub entity_uuid: EntityUuid,
    pub entity_edition_id: EntityEditionId,
    pub decision_time: LeftClosedTemporalInterval<DecisionTime>,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_link_edges_tmp")]
pub struct EntityLinkEdgeRow {
    pub web_id: OwnedById,
    pub entity_uuid: EntityUuid,
    pub left_web_id: OwnedById,
    pub left_entity_uuid: EntityUuid,
    pub right_web_id: OwnedById,
    pub right_entity_uuid: EntityUuid,
}
