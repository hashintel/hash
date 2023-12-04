use authorization::schema::EntityRelationAndSubject;
use graph_types::{
    knowledge::{
        entity::{EntityProperties, EntityRecordId, EntityTemporalMetadata},
        link::LinkData,
    },
    provenance::ProvenanceMetadata,
};
use serde::{Deserialize, Serialize};
use type_system::url::VersionedUrl;

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "Used in procedural macros"
)]
fn is_false(b: &bool) -> bool {
    !b
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomEntityMetadata {
    pub provenance: ProvenanceMetadata,
    pub archived: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub draft: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityMetadata {
    pub record_id: EntityRecordId,
    pub entity_type_id: VersionedUrl,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temporal_versioning: Option<EntityTemporalMetadata>,
    pub custom: CustomEntityMetadata,
}

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
