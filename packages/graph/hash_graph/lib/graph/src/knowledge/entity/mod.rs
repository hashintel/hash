mod query;

use std::{collections::HashMap, fmt};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio_postgres::types::{FromSql, ToSql};
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::ToSchema;
use uuid::Uuid;

pub use self::query::{EntityQueryPath, EntityQueryPathVisitor};
use crate::provenance::{CreatedById, OwnedById, UpdatedById};

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, FromSql, ToSql,
)]
#[repr(transparent)]
#[postgres(transparent)]
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

/// An entity.
///
/// When expressed as JSON, this should validate against its respective entity type(s).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[schema(value_type = Object)]
pub struct Entity(HashMap<BaseUri, serde_json::Value>);

impl Entity {
    #[must_use]
    pub fn empty() -> Self {
        Self(HashMap::new())
    }
}

impl Entity {
    #[must_use]
    pub const fn properties(&self) -> &HashMap<BaseUri, serde_json::Value> {
        &self.0
    }
}

/// The metadata required to uniquely identify an instance of an [`Entity`] that has been persisted
/// in the datastore.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersistedEntityIdentifier {
    entity_uuid: EntityUuid,
    #[schema(value_type = String)]
    version: DateTime<Utc>,
    owned_by_id: OwnedById,
}

impl PersistedEntityIdentifier {
    #[must_use]
    pub const fn new(
        entity_uuid: EntityUuid,
        version: DateTime<Utc>,
        owned_by_id: OwnedById,
    ) -> Self {
        Self {
            entity_uuid,
            version,
            owned_by_id,
        }
    }

    #[must_use]
    pub const fn entity_uuid(&self) -> EntityUuid {
        self.entity_uuid
    }

    #[must_use]
    pub const fn version(&self) -> DateTime<Utc> {
        self.version
    }

    #[must_use]
    pub const fn owned_by_id(&self) -> OwnedById {
        self.owned_by_id
    }
}

/// The associated information for 'Link' entities
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LinkEntityMetadata {
    left_entity_uuid: EntityUuid,
    right_entity_uuid: EntityUuid,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    left_order: Option<LinkOrder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    right_order: Option<LinkOrder>,
}

impl LinkEntityMetadata {
    #[must_use]
    pub const fn new(
        left_entity_uuid: EntityUuid,
        right_entity_uuid: EntityUuid,
        left_order: Option<LinkOrder>,
        right_order: Option<LinkOrder>,
    ) -> Self {
        Self {
            left_entity_uuid,
            right_entity_uuid,
            left_order,
            right_order,
        }
    }

    #[must_use]
    pub const fn left_entity_uuid(&self) -> EntityUuid {
        self.left_entity_uuid
    }

    #[must_use]
    pub const fn right_entity_uuid(&self) -> EntityUuid {
        self.right_entity_uuid
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
pub struct PersistedEntityMetadata {
    identifier: PersistedEntityIdentifier,
    #[schema(value_type = String)]
    entity_type_id: VersionedUri,
    // TODO: encapsulate these in a `ProvenanceMetadata` struct?
    //  https://app.asana.com/0/1201095311341924/1203227079758117/f
    created_by_id: CreatedById,
    updated_by_id: UpdatedById,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    link_metadata: Option<LinkEntityMetadata>,
    archived: bool,
}

impl PersistedEntityMetadata {
    #[must_use]
    pub const fn new(
        identifier: PersistedEntityIdentifier,
        entity_type_id: VersionedUri,
        created_by_id: CreatedById,
        updated_by_id: UpdatedById,
        link_metadata: Option<LinkEntityMetadata>,
        archived: bool,
    ) -> Self {
        Self {
            identifier,
            entity_type_id,
            created_by_id,
            updated_by_id,
            link_metadata,
            archived,
        }
    }

    #[must_use]
    pub const fn identifier(&self) -> &PersistedEntityIdentifier {
        &self.identifier
    }

    #[must_use]
    pub const fn entity_type_id(&self) -> &VersionedUri {
        &self.entity_type_id
    }

    #[must_use]
    pub const fn created_by_id(&self) -> CreatedById {
        self.created_by_id
    }

    #[must_use]
    pub const fn updated_by_id(&self) -> UpdatedById {
        self.updated_by_id
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
pub struct PersistedEntity {
    inner: Entity,
    metadata: PersistedEntityMetadata,
}

impl PersistedEntity {
    #[must_use]
    pub const fn new(
        inner: Entity,
        identifier: PersistedEntityIdentifier,
        entity_type_id: VersionedUri,
        created_by_id: CreatedById,
        updated_by_id: UpdatedById,
        link_metadata: Option<LinkEntityMetadata>,
        archived: bool,
    ) -> Self {
        Self {
            inner,
            metadata: PersistedEntityMetadata::new(
                identifier,
                entity_type_id,
                created_by_id,
                updated_by_id,
                link_metadata,
                archived,
            ),
        }
    }

    #[must_use]
    pub const fn inner(&self) -> &Entity {
        &self.inner
    }

    #[must_use]
    pub const fn metadata(&self) -> &PersistedEntityMetadata {
        &self.metadata
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_entity(json: &str) {
        let json_value: serde_json::Value = serde_json::from_str(json).expect("invalid JSON");

        let entity: Entity = serde_json::from_value(json_value.clone()).expect("invalid entity");

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
