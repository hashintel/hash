use std::fmt;

use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;
use utoipa::Component;

use super::EntityId;
use crate::ontology::AccountId;

/// A Link between a source and a target entity identified by [`EntityId`]s.
///
/// The link is described by a link type [`VersionedUri`].
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    source_entity_id: EntityId,
    target_entity_id: EntityId,
    #[component(value_type = String)]
    link_type_uri: VersionedUri,
}

impl Link {
    #[must_use]
    pub const fn new(
        source_entity_id: EntityId,
        target_entity_id: EntityId,
        link_type_uri: VersionedUri,
    ) -> Self {
        Self {
            source_entity_id,
            target_entity_id,
            link_type_uri,
        }
    }

    #[must_use]
    pub const fn source_entity(&self) -> EntityId {
        self.source_entity_id
    }

    #[must_use]
    pub const fn target_entity(&self) -> EntityId {
        self.target_entity_id
    }

    #[must_use]
    pub const fn link_type_uri(&self) -> &VersionedUri {
        &self.link_type_uri
    }
}

/// A record of a [`Link`] that has been persisted in the datastore, with its associated
/// metadata.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct PersistedLink {
    inner: Link,
    // Note: this is inconsistent with `PersistedEntity` as the analog of
    // `PersistedEntityIdentifier` is encapsulated within the `Link` struct..
    owned_by_id: AccountId,
    // TODO: add versioning information -
    //   https://app.asana.com/0/1200211978612931/1203006164248577/f
}

impl PersistedLink {
    #[must_use]
    pub const fn new(inner: Link, owned_by_id: AccountId) -> Self {
        Self { inner, owned_by_id }
    }

    #[must_use]
    pub const fn inner(&self) -> &Link {
        &self.inner
    }

    #[must_use]
    pub const fn owned_by_id(&self) -> &AccountId {
        &self.owned_by_id
    }
}

impl fmt::Display for Link {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{:?}", &self)
    }
}
