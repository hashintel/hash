use std::{collections::HashMap, fmt};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio_postgres::types::{FromSql, ToSql};
use utoipa::Component;
use uuid::Uuid;

use crate::{
    ontology::{types::uri::BaseUri, AccountId},
    VersionedUri,
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

/// A record of an entity that has been persisted in the datastore, with its associated metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
pub struct PersistedEntity {
    inner: Entity,
    id: EntityId,
    version: DateTime<Utc>,
    type_versioned_uri: VersionedUri,
    created_by: AccountId,
}

impl PersistedEntity {
    pub fn new(
        inner: Entity,
        id: EntityId,
        version: DateTime<Utc>,
        type_versioned_uri: VersionedUri,
        created_by: AccountId,
    ) -> Self {
        Self {
            inner,
            id,
            version,
            type_versioned_uri,
            created_by,
        }
    }

    pub fn inner(&self) -> &Entity {
        &self.inner
    }

    pub fn id(&self) -> EntityId {
        self.id
    }

    pub fn version(&self) -> DateTime<Utc> {
        self.version
    }

    pub fn type_versioned_uri(&self) -> &VersionedUri {
        &self.type_versioned_uri
    }

    pub fn created_by(&self) -> AccountId {
        self.created_by
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
