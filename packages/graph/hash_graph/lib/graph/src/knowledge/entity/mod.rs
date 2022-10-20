use std::{collections::HashMap, fmt};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio_postgres::types::{FromSql, ToSql};
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::ontology::AccountId;

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, FromSql, ToSql,
)]
#[repr(transparent)]
#[postgres(transparent)]
pub struct EntityId(Uuid);

impl EntityId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

impl fmt::Display for EntityId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", &self.0)
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
    pub const fn properties(&self) -> &HashMap<BaseUri, serde_json::Value> {
        &self.0
    }
}

/// The metadata required to uniquely identify an instance of an [`Entity`] that has been persisted
/// in the datastore.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersistedEntityIdentifier {
    entity_id: EntityId,
    #[schema(value_type = String)]
    version: DateTime<Utc>,
    owned_by_id: AccountId,
}

impl PersistedEntityIdentifier {
    #[must_use]
    pub const fn new(entity_id: EntityId, version: DateTime<Utc>, owned_by_id: AccountId) -> Self {
        Self {
            entity_id,
            version,
            owned_by_id,
        }
    }

    #[must_use]
    pub const fn entity_id(&self) -> EntityId {
        self.entity_id
    }

    #[must_use]
    pub const fn version(&self) -> DateTime<Utc> {
        self.version
    }

    #[must_use]
    pub const fn owned_by_id(&self) -> AccountId {
        self.owned_by_id
    }
}

/// The metadata of an [`Entity`] record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersistedEntityMetadata {
    identifier: PersistedEntityIdentifier,
    #[schema(value_type = String)]
    entity_type_id: VersionedUri,
    created_by_id: AccountId,
    updated_by_id: AccountId,
    removed_by_id: Option<AccountId>,
}

impl PersistedEntityMetadata {
    #[must_use]
    pub const fn new(
        identifier: PersistedEntityIdentifier,
        entity_type_id: VersionedUri,
        created_by_id: AccountId,
        updated_by_id: AccountId,
        removed_by_id: Option<AccountId>,
    ) -> Self {
        Self {
            identifier,
            entity_type_id,
            created_by_id,
            updated_by_id,
            removed_by_id,
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
        created_by_id: AccountId,
        updated_by_id: AccountId,
        removed_by_id: Option<AccountId>,
    ) -> Self {
        Self {
            inner,
            metadata: PersistedEntityMetadata::new(
                identifier,
                entity_type_id,
                created_by_id,
                updated_by_id,
                removed_by_id,
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
