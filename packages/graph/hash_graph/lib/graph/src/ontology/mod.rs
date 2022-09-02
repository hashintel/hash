//! TODO: DOC

pub mod domain_validator;

use core::fmt;

use serde::{Deserialize, Serialize, Serializer};
use serde_json;
use tokio_postgres::types::{FromSql, ToSql};
use type_system::{uri::VersionedUri, DataType, EntityType, LinkType, PropertyType};
use utoipa::Component;
use uuid::Uuid;

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
    #[component(value_type = String)]
    uri: VersionedUri,
    created_by: AccountId,
}

impl PersistedOntologyIdentifier {
    #[must_use]
    pub const fn new(uri: VersionedUri, created_by: AccountId) -> Self {
        Self { uri, created_by }
    }

    #[must_use]
    pub const fn uri(&self) -> &VersionedUri {
        &self.uri
    }

    #[must_use]
    pub const fn created_by(&self) -> AccountId {
        self.created_by
    }
}

fn serialize_ontology_type<T, S>(ontology_type: &T, serializer: S) -> Result<S::Ok, S::Error>
where
    T: Clone,
    serde_json::Value: From<T>,
    S: Serializer,
{
    // This clone is necessary because `Serialize` requires us to take the param by reference here
    //  even though we only use it in places where we could move
    let value: serde_json::Value = ontology_type.clone().into();
    value.serialize(serializer)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
pub struct PersistedDataType {
    #[component(value_type = VAR_DATA_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    pub inner: DataType,
    pub identifier: PersistedOntologyIdentifier,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
pub struct PersistedPropertyType {
    #[component(value_type = VAR_PROPERTY_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    pub inner: PropertyType,
    pub identifier: PersistedOntologyIdentifier,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
pub struct PersistedLinkType {
    #[component(value_type = VAR_LINK_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    pub inner: LinkType,
    pub identifier: PersistedOntologyIdentifier,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
pub struct PersistedEntityType {
    #[component(value_type = VAR_ENTITY_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    pub inner: EntityType,
    pub identifier: PersistedOntologyIdentifier,
}
