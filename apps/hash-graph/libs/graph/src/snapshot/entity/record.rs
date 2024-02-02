use authorization::schema::EntityRelationAndSubject;
use graph_types::knowledge::{
    entity::{EntityMetadata, EntityProperties, EntityUuid},
    link::LinkData,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntitySnapshotRecord {
    pub properties: EntityProperties,
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
