//! TODO: DOC

pub mod domain_validator;

use core::fmt;

use error_stack::{Context, IntoReport, Result, ResultExt};
use serde::{Deserialize, Serialize, Serializer};
use serde_json;
use tokio_postgres::types::{FromSql, ToSql};
use type_system::{uri::VersionedUri, DataType, EntityType, LinkType, PropertyType};
use utoipa::Component;
use uuid::Uuid;

use crate::store::query::Expression;

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

#[derive(Debug)]
pub struct PatchAndParseError;
impl Context for PatchAndParseError {}

impl fmt::Display for PatchAndParseError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to patch schema's id and parse as type")
    }
}

/// Takes the [`serde_json::Value`] representation of an ontology type schema (without an "$id"
/// field), inserts the given [`VersionedUri`] under the "$id" key, and tries to deserialize the
/// type.
///
/// # Errors
///
/// - [`PatchAndParseError`] if
///   - "$id" already existed
///   - the [`serde_json::Value`] wasn't an 'Object'
///   - deserializing into `T` failed
pub fn patch_id_and_parse<T>(
    id: &VersionedUri,
    mut value: serde_json::Value,
) -> Result<T, PatchAndParseError>
where
    T: TryFrom<serde_json::Value, Error: Context>,
{
    if let Some(object) = value.as_object_mut() {
        if let Some(previous_val) = object.insert(
            "$id".to_owned(),
            serde_json::to_value(id).expect("failed to deserialize id"),
        ) {
            return Err(PatchAndParseError)
                .into_report()
                .attach_printable("schema already had an $id")
                .attach_printable(previous_val);
        }
    } else {
        return Err(PatchAndParseError)
            .into_report()
            .attach_printable("unexpected schema format, couldn't parse as object")
            .attach_printable(value);
    }

    let ontology_type: T = value
        .try_into()
        .into_report()
        .change_context(PatchAndParseError)?;

    Ok(ontology_type)
}

fn serialize_ontology_type<T, S>(
    ontology_type: &T,
    serializer: S,
) -> std::result::Result<S::Ok, S::Error>
where
    T: Clone,
    serde_json::Value: From<T>,
    S: Serializer,
{
    // This clone is necessary because `Serialize` requires us to take the param by reference here
    //  even though we only use it in places where we could move
    serde_json::Value::from(ontology_type.clone()).serialize(serializer)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
pub struct PersistedDataType {
    #[component(value_type = VAR_DATA_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    pub inner: DataType,
    pub identifier: PersistedOntologyIdentifier,
}

#[derive(Debug, Deserialize, Component)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DataTypeQuery {
    #[serde(rename = "query")]
    pub expression: Expression,
    pub data_type_query_depth: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct DataTypeRootedSubgraph {
    pub data_type: PersistedDataType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
pub struct PersistedPropertyType {
    #[component(value_type = VAR_PROPERTY_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    pub inner: PropertyType,
    pub identifier: PersistedOntologyIdentifier,
}

#[derive(Debug, Deserialize, Component)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PropertyTypeQuery {
    #[serde(rename = "query")]
    pub expression: Expression,
    pub data_type_query_depth: u8,
    pub property_type_query_depth: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct PropertyTypeRootedSubgraph {
    pub property_type: PersistedPropertyType,
    pub referenced_data_types: Vec<PersistedDataType>,
    pub referenced_property_types: Vec<PersistedPropertyType>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
pub struct PersistedLinkType {
    #[component(value_type = VAR_LINK_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    pub inner: LinkType,
    pub identifier: PersistedOntologyIdentifier,
}

#[derive(Debug, Deserialize, Component)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LinkTypeQuery {
    #[serde(rename = "query")]
    pub expression: Expression,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct LinkTypeRootedSubgraph {
    pub link_type: PersistedLinkType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
pub struct PersistedEntityType {
    #[component(value_type = VAR_ENTITY_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    pub inner: EntityType,
    pub identifier: PersistedOntologyIdentifier,
}

#[derive(Debug, Deserialize, Component)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct EntityTypeQuery {
    #[serde(rename = "query")]
    pub expression: Expression,
    pub data_type_query_depth: u8,
    pub property_type_query_depth: u8,
    pub link_type_query_depth: u8,
    pub entity_type_query_depth: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Component)]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeRootedSubgraph {
    pub entity_type: PersistedEntityType,
    pub referenced_data_types: Vec<PersistedDataType>,
    pub referenced_property_types: Vec<PersistedPropertyType>,
    pub referenced_link_types: Vec<PersistedLinkType>,
    pub referenced_entity_types: Vec<PersistedEntityType>,
}
