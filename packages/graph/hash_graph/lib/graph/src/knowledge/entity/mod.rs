use std::{collections::HashMap, fmt};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio_postgres::types::{FromSql, ToSql};
use utoipa::Component;
use uuid::Uuid;

use crate::ontology::{
    types::uri::{BaseUri, VersionedUri},
    AccountId,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, Component, FromSql, ToSql)]
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
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
pub struct Entity {
    #[serde(flatten)]
    properties: HashMap<BaseUri, serde_json::Value>,
}

// TODO: consider making an analogue of this for Links and elements of the Ontology
/// The metadata required to uniquely identify an instance of an [`Entity`] that has been persisted
/// in the datastore.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct PersistedEntityIdentifier {
    entity_id: EntityId,
    version: DateTime<Utc>,
    created_by: AccountId,
}

impl PersistedEntityIdentifier {
    #[must_use]
    pub const fn new(entity_id: EntityId, version: DateTime<Utc>, created_by: AccountId) -> Self {
        Self {
            entity_id,
            version,
            created_by,
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
    pub const fn created_by(&self) -> AccountId {
        self.created_by
    }
}

/// A record of an [`Entity`] that has been persisted in the datastore, with its associated
/// metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct PersistedEntity {
    inner: Entity,
    #[serde(flatten)]
    identifier: PersistedEntityIdentifier,
    #[component(value_type = String)]
    type_versioned_uri: VersionedUri,
}

impl PersistedEntity {
    #[must_use]
    pub const fn new(
        inner: Entity,
        entity_id: EntityId,
        version: DateTime<Utc>,
        type_versioned_uri: VersionedUri,
        created_by: AccountId,
    ) -> Self {
        Self {
            inner,
            identifier: PersistedEntityIdentifier::new(entity_id, version, created_by),
            type_versioned_uri,
        }
    }

    #[must_use]
    pub const fn inner(&self) -> &Entity {
        &self.inner
    }

    #[must_use]
    pub const fn identifier(&self) -> &PersistedEntityIdentifier {
        &self.identifier
    }

    #[must_use]
    pub const fn type_versioned_uri(&self) -> &VersionedUri {
        &self.type_versioned_uri
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
        test_entity(crate::test_data::entity::BOOK_V1);
    }

    #[test]
    fn address() {
        test_entity(crate::test_data::entity::ADDRESS_V1);
    }

    #[test]
    fn organization() {
        test_entity(crate::test_data::entity::ORGANIZATION_V1);
    }

    #[test]
    fn building() {
        test_entity(crate::test_data::entity::BUILDING_V1);
    }

    #[test]
    fn person() {
        test_entity(crate::test_data::entity::PERSON_A_V1);
    }

    #[test]
    fn playlist() {
        test_entity(crate::test_data::entity::PLAYLIST_V1);
    }

    #[test]
    fn song() {
        test_entity(crate::test_data::entity::SONG_V1);
    }

    #[test]
    fn page() {
        test_entity(crate::test_data::entity::PAGE_V1);
    }
}
