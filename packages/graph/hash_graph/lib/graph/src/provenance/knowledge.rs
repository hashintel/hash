use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;
use utoipa::ToSchema;

use crate::{
    knowledge::{Entity, EntityId, Link},
    provenance::{CreatedById, OwnedById, RemovedById, UpdatedById},
};

/// The metadata required to uniquely identify an instance of an [`Entity`] that has been persisted
/// in the datastore.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersistedEntityIdentifier {
    entity_id: EntityId,
    #[schema(value_type = String)]
    version: DateTime<Utc>,
    owned_by_id: OwnedById,
}

impl PersistedEntityIdentifier {
    #[must_use]
    pub const fn new(entity_id: EntityId, version: DateTime<Utc>, owned_by_id: OwnedById) -> Self {
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
    pub const fn owned_by_id(&self) -> OwnedById {
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
    created_by_id: CreatedById,
    updated_by_id: UpdatedById,
    removed_by_id: Option<RemovedById>,
}

impl PersistedEntityMetadata {
    #[must_use]
    pub const fn new(
        identifier: PersistedEntityIdentifier,
        entity_type_id: VersionedUri,
        created_by_id: CreatedById,
        updated_by_id: UpdatedById,
        removed_by_id: Option<RemovedById>,
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
        created_by_id: CreatedById,
        updated_by_id: UpdatedById,
        removed_by_id: Option<RemovedById>,
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

/// The metadata of a [`Link`] record.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersistedLinkMetadata {
    // Note: this is inconsistent with `PersistedEntity` as the analog of
    // `PersistedEntityIdentifier` is encapsulated within the `Link` struct..
    owned_by_id: OwnedById,
    // TODO: add versioning information -
    //   https://app.asana.com/0/1200211978612931/1203006164248577/f
    created_by_id: CreatedById,
}

impl PersistedLinkMetadata {
    #[must_use]
    pub const fn new(owned_by_id: OwnedById, created_by_id: CreatedById) -> Self {
        Self {
            owned_by_id,
            created_by_id,
        }
    }

    #[must_use]
    pub const fn owned_by_id(&self) -> OwnedById {
        self.owned_by_id
    }

    #[must_use]
    pub const fn created_by_id(&self) -> CreatedById {
        self.created_by_id
    }
}

/// A record of a [`Link`] that has been persisted in the datastore, with its associated
/// metadata.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersistedLink {
    inner: Link,
    metadata: PersistedLinkMetadata,
}

impl PersistedLink {
    #[must_use]
    pub const fn new(inner: Link, owned_by_id: OwnedById, created_by_id: CreatedById) -> Self {
        Self {
            inner,
            metadata: PersistedLinkMetadata::new(owned_by_id, created_by_id),
        }
    }

    #[must_use]
    pub const fn metadata(&self) -> &PersistedLinkMetadata {
        &self.metadata
    }

    #[must_use]
    pub const fn inner(&self) -> &Link {
        &self.inner
    }
}
