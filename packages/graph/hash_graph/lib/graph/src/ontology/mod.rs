//! Model types that describe the elements of the HASH Ontology.

pub mod types;

use core::fmt;

use serde::{Deserialize, Serialize};
use tokio_postgres::types::{FromSql, ToSql};
use type_system::{uri::VersionedUri, DataType, PropertyType};
use utoipa::Component;
use uuid::Uuid;

use crate::ontology::types::{EntityType, LinkType};

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
pub struct PersistedDataType {
    #[component(value_type = VAR_DATA_TYPE)]
    pub inner: DataType,
    pub identifier: PersistedOntologyIdentifier,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
pub struct PersistedPropertyType {
    #[component(value_type = VAR_PROPERTY_TYPE)]
    pub inner: PropertyType,
    pub identifier: PersistedOntologyIdentifier,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
pub struct PersistedLinkType {
    #[component(value_type = VAR_LINK_TYPE)]
    pub inner: LinkType,
    pub identifier: PersistedOntologyIdentifier,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Component)]
pub struct PersistedEntityType {
    #[component(value_type = VAR_ENTITY_TYPE)]
    pub inner: EntityType,
    pub identifier: PersistedOntologyIdentifier,
}

#[cfg(test)]
mod tests {
    use std::fmt::Debug;

    use serde::{Deserialize, Serialize};

    /// Will serialize as a constant value `"string"`
    #[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub enum StringTypeTag {
        #[default]
        String,
    }

    #[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    pub struct StringTypeStruct {
        r#type: StringTypeTag,
    }

    pub fn check_serialization<T>(
        value: &T,
        json: &serde_json::Value,
    ) -> Result<(), serde_json::Error>
    where
        T: Debug + PartialEq + Serialize,
    {
        let serialized_json = serde_json::to_value(value)?;
        assert_eq!(
            &serialized_json, json,
            "Serialized value does not match expected JSON",
        );

        Ok(())
    }

    pub fn check_deserialization<T>(
        value: &T,
        json: serde_json::Value,
    ) -> Result<(), serde_json::Error>
    where
        for<'de> T: Debug + PartialEq + Deserialize<'de>,
    {
        let deserialized_json = serde_json::from_value::<T>(json)?;
        assert_eq!(
            &deserialized_json, value,
            "Deserialized JSON does not match expected value",
        );

        Ok(())
    }

    pub fn check<T>(value: &T, json: serde_json::Value) -> Result<(), serde_json::Error>
    where
        for<'de> T: Debug + PartialEq + Serialize + Deserialize<'de>,
    {
        check_serialization(value, &json)?;
        check_deserialization(value, json)?;
        Ok(())
    }

    pub fn check_invalid_json<T>(json: serde_json::Value)
    where
        for<'de> T: Debug + Deserialize<'de>,
    {
        serde_json::from_value::<T>(json)
            .expect_err("JSON was expected to be invalid but it was accepted");
    }
}
