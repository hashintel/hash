use serde::{Deserialize, Serialize};
use type_system::url::VersionedUrl;

use crate::{
    identifier::knowledge::{EntityRecordId, EntityTemporalMetadata},
    knowledge::{Entity, EntityProperties, LinkData},
    provenance::ProvenanceMetadata,
};

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomEntityMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<ProvenanceMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
}

impl CustomEntityMetadata {
    #[must_use]
    const fn is_empty(&self) -> bool {
        self.provenance.is_none() && self.archived.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityMetadata {
    pub record_id: EntityRecordId,
    pub entity_type_id: VersionedUrl,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temporal_versioning: Option<EntityTemporalMetadata>,
    #[serde(default, skip_serializing_if = "CustomEntityMetadata::is_empty")]
    pub custom: CustomEntityMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityRecord {
    pub properties: EntityProperties,
    pub metadata: EntityMetadata,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link_data: Option<LinkData>,
}

impl From<Entity> for EntityRecord {
    fn from(entity: Entity) -> Self {
        Self {
            properties: entity.properties,
            metadata: EntityMetadata {
                record_id: entity.metadata.record_id(),
                entity_type_id: entity.metadata.entity_type_id().clone(),
                temporal_versioning: Some(entity.metadata.temporal_versioning().clone()),
                custom: CustomEntityMetadata {
                    provenance: Some(entity.metadata.provenance()),
                    archived: Some(entity.metadata.archived()),
                },
            },
            link_data: entity.link_data,
        }
    }
}
