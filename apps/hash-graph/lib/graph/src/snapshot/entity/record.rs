use graph_types::{
    knowledge::{
        entity::{Entity, EntityProperties, EntityRecordId, EntityTemporalMetadata},
        link::LinkData,
    },
    provenance::ProvenanceMetadata,
};
use serde::{Deserialize, Serialize};
use type_system::url::VersionedUrl;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomEntityMetadata {
    pub provenance: ProvenanceMetadata,
    pub archived: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityMetadata {
    pub record_id: EntityRecordId,
    pub entity_type_id: VersionedUrl,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temporal_versioning: Option<EntityTemporalMetadata>,
    pub custom: CustomEntityMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntitySnapshotRecord {
    pub properties: EntityProperties,
    pub metadata: EntityMetadata,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link_data: Option<LinkData>,
}

impl From<Entity> for EntitySnapshotRecord {
    fn from(entity: Entity) -> Self {
        Self {
            properties: entity.properties,
            metadata: EntityMetadata {
                record_id: entity.metadata.record_id(),
                entity_type_id: entity.metadata.entity_type_id().clone(),
                temporal_versioning: Some(entity.metadata.temporal_versioning().clone()),
                custom: CustomEntityMetadata {
                    provenance: entity.metadata.provenance(),
                    archived: entity.metadata.archived(),
                },
            },
            link_data: entity.link_data,
        }
    }
}
