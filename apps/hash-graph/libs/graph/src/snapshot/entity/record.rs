use authorization::schema::EntityRelationAndSubject;
use graph_types::knowledge::{
    entity::{EntityMetadata, EntityProperties},
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub relations: Vec<EntityRelationAndSubject>,
}
