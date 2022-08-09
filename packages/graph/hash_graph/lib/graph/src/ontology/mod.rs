//! Model types that describe the elements of the HASH Ontology.

pub mod types;

use core::fmt;

use serde::{Deserialize, Serialize};
use tokio_postgres::types::{FromSql, ToSql};
use utoipa::Component;
use uuid::Uuid;

use crate::ontology::types::{DataType, EntityType, LinkType, PropertyType};

// TODO - find a good place for AccountId, perhaps it will become redundant in a future design

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, Component, FromSql, ToSql)]
#[repr(transparent)]
#[postgres(transparent)]
pub struct AccountId(Uuid);

impl AccountId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

impl fmt::Display for AccountId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", &self.0)
    }
}

/// The metadata required to uniquely identify an ontology element that has been persisted in the
/// datastore.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct PersistedOntologyIdentifier {
    created_by: AccountId,
}

impl PersistedOntologyIdentifier {
    #[must_use]
    pub const fn new(created_by: AccountId) -> Self {
        Self { created_by }
    }

    #[must_use]
    pub const fn created_by(&self) -> AccountId {
        self.created_by
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
pub struct PersistedOntologyType<T> {
    inner: T,
    identifier: PersistedOntologyIdentifier,
}

impl<T> PersistedOntologyType<T> {
    #[must_use]
    pub const fn new(inner: T, created_by: AccountId) -> Self {
        Self {
            inner,
            identifier: PersistedOntologyIdentifier::new(created_by),
        }
    }

    #[must_use]
    pub const fn inner(&self) -> &T {
        &self.inner
    }

    #[must_use]
    pub const fn identifier(&self) -> &PersistedOntologyIdentifier {
        &self.identifier
    }
}

pub type PersistedDataType = PersistedOntologyType<DataType>;
pub type PersistedPropertyType = PersistedOntologyType<PropertyType>;
pub type PersistedLinkType = PersistedOntologyType<LinkType>;
pub type PersistedEntityType = PersistedOntologyType<EntityType>;
