mod query;

use std::{collections::HashMap, fmt};

use serde::{Deserialize, Serialize};
use tokio_postgres::types::{FromSql, ToSql};
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::ToSchema;
use uuid::Uuid;

pub use self::query::{EntityQueryPath, EntityQueryPathVisitor};
use crate::{
    identifier::knowledge::{EntityEditionId, EntityId},
    provenance::ProvenanceMetadata,
};

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, ToSchema,
)]
#[repr(transparent)]
pub struct EntityUuid(Uuid);

impl EntityUuid {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }

    #[must_use]
    pub const fn as_uuid(self) -> Uuid {
        self.0
    }
}

impl fmt::Display for EntityUuid {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", &self.0)
    }
}

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, FromSql, ToSql,
)]
#[repr(transparent)]
#[postgres(transparent)]
pub struct LinkOrder(i32);

impl LinkOrder {
    #[must_use]
    pub const fn new(order: i32) -> Self {
        Self(order)
    }
}

/// The properties of an entity.
///
/// When expressed as JSON, this should validate against its respective entity type(s).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[schema(value_type = Object)]
pub struct EntityProperties(HashMap<BaseUri, serde_json::Value>);

impl EntityProperties {
    #[must_use]
    pub fn empty() -> Self {
        Self(HashMap::new())
    }
}

impl EntityProperties {
    #[must_use]
    pub const fn properties(&self) -> &HashMap<BaseUri, serde_json::Value> {
        &self.0
    }
}

/// The associated information for 'Link' entities
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LinkEntityMetadata {
    left_entity_id: EntityId,
    right_entity_id: EntityId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    left_order: Option<LinkOrder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    right_order: Option<LinkOrder>,
}

impl LinkEntityMetadata {
    #[must_use]
    pub const fn new(
        left_entity_id: EntityId,
        right_entity_id: EntityId,
        left_order: Option<LinkOrder>,
        right_order: Option<LinkOrder>,
    ) -> Self {
        Self {
            left_entity_id,
            right_entity_id,
            left_order,
            right_order,
        }
    }

    #[must_use]
    pub const fn left_entity_id(&self) -> EntityId {
        self.left_entity_id
    }

    #[must_use]
    pub const fn right_entity_id(&self) -> EntityId {
        self.right_entity_id
    }

    #[must_use]
    pub const fn left_order(&self) -> Option<LinkOrder> {
        self.left_order
    }

    #[must_use]
    pub const fn right_order(&self) -> Option<LinkOrder> {
        self.right_order
    }
}

/// The metadata of an [`Entity`] record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
// TODO: deny_unknown_fields on other structs
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityMetadata {
    edition_id: EntityEditionId,
    #[schema(value_type = String)]
    entity_type_id: VersionedUri,
    #[serde(rename = "provenance")]
    provenance_metadata: ProvenanceMetadata,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    link_metadata: Option<LinkEntityMetadata>,
    archived: bool,
}

impl EntityMetadata {
    #[must_use]
    pub const fn new(
        edition_id: EntityEditionId,
        entity_type_id: VersionedUri,
        provenance_metadata: ProvenanceMetadata,
        link_metadata: Option<LinkEntityMetadata>,
        archived: bool,
    ) -> Self {
        Self {
            edition_id,
            entity_type_id,
            provenance_metadata,
            link_metadata,
            archived,
        }
    }

    #[must_use]
    pub const fn edition_id(&self) -> EntityEditionId {
        self.edition_id
    }

    #[must_use]
    pub const fn entity_type_id(&self) -> &VersionedUri {
        &self.entity_type_id
    }

    #[must_use]
    pub const fn provenance_metadata(&self) -> ProvenanceMetadata {
        self.provenance_metadata
    }

    #[must_use]
    pub const fn link_metadata(&self) -> Option<LinkEntityMetadata> {
        self.link_metadata
    }

    #[must_use]
    pub const fn archived(&self) -> bool {
        self.archived
    }
}

/// A record of an [`Entity`] that has been persisted in the datastore, with its associated
/// metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    properties: EntityProperties,
    metadata: EntityMetadata,
}

impl Entity {
    #[must_use]
    pub const fn new(
        properties: EntityProperties,
        identifier: EntityEditionId,
        entity_type_id: VersionedUri,
        provenance_metadata: ProvenanceMetadata,
        link_metadata: Option<LinkEntityMetadata>,
        archived: bool,
    ) -> Self {
        Self {
            properties,
            metadata: EntityMetadata::new(
                identifier,
                entity_type_id,
                provenance_metadata,
                link_metadata,
                archived,
            ),
        }
    }

    #[must_use]
    pub const fn properties(&self) -> &EntityProperties {
        &self.properties
    }

    #[must_use]
    pub const fn metadata(&self) -> &EntityMetadata {
        &self.metadata
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_entity(json: &str) {
        let json_value: serde_json::Value = serde_json::from_str(json).expect("invalid JSON");

        let entity: EntityProperties =
            serde_json::from_value(json_value.clone()).expect("invalid entity");

        assert_eq!(
            serde_json::to_value(entity.clone()).expect("could not serialize"),
            json_value,
            "{entity:#?}"
        );
    }

    #[test]
    fn book() {
        test_entity(graph_test_data::entity::BOOK_V1);
    }

    #[test]
    fn address() {
        test_entity(graph_test_data::entity::ADDRESS_V1);
    }

    #[test]
    fn organization() {
        test_entity(graph_test_data::entity::ORGANIZATION_V1);
    }

    #[test]
    fn building() {
        test_entity(graph_test_data::entity::BUILDING_V1);
    }

    #[test]
    fn person() {
        test_entity(graph_test_data::entity::PERSON_A_V1);
    }

    #[test]
    fn playlist() {
        test_entity(graph_test_data::entity::PLAYLIST_V1);
    }

    #[test]
    fn song() {
        test_entity(graph_test_data::entity::SONG_V1);
    }

    #[test]
    fn page() {
        test_entity(graph_test_data::entity::PAGE_V1);
    }
}
