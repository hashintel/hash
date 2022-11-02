//! TODO: DOC

mod data_type;
pub mod domain_validator;
mod entity_type;
mod property_type;

use core::fmt;
use std::result::Result as StdResult;

use error_stack::{Context, IntoReport, Result, ResultExt};
use serde::{
    de,
    de::{Unexpected, Visitor},
    Deserialize, Deserializer, Serialize, Serializer,
};
use serde_json;
use type_system::{uri::VersionedUri, DataType, EntityType, PropertyType};
use utoipa::ToSchema;

pub use self::{
    data_type::{DataTypeQueryPath, DataTypeQueryPathVisitor},
    entity_type::{EntityTypeQueryPath, EntityTypeQueryPathVisitor},
    property_type::{PropertyTypeQueryPath, PropertyTypeQueryPathVisitor},
};
use crate::provenance::{CreatedById, OwnedById, RemovedById, UpdatedById};

pub enum Selector {
    Asterisk,
}

impl<'de> Deserialize<'de> for Selector {
    fn deserialize<D>(deserializer: D) -> StdResult<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct SelectorVisitor;

        impl<'de> Visitor<'de> for SelectorVisitor {
            type Value = Selector;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a wildcard (*)")
            }

            fn visit_str<E: de::Error>(self, v: &str) -> StdResult<Self::Value, E> {
                match v {
                    "*" => Ok(Selector::Asterisk),
                    _ => Err(de::Error::invalid_value(Unexpected::Str(v), &self)),
                }
            }

            fn visit_bytes<E: de::Error>(self, v: &[u8]) -> StdResult<Self::Value, E> {
                match core::str::from_utf8(v) {
                    Ok(s) => self.visit_str(s),
                    Err(_) => Err(E::invalid_value(de::Unexpected::Bytes(v), &self)),
                }
            }
        }

        deserializer.deserialize_str(SelectorVisitor)
    }
}

/// The metadata required to uniquely identify an ontology element that has been persisted in the
/// datastore.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersistedOntologyIdentifier {
    #[schema(value_type = String)]
    uri: VersionedUri,
    // TODO: owned_by_id is not required to identify an ontology element
    //  https://app.asana.com/0/1202805690238892/1203214689883091/f
    owned_by_id: OwnedById,
}

impl PersistedOntologyIdentifier {
    #[must_use]
    pub const fn new(uri: VersionedUri, owned_by_id: OwnedById) -> Self {
        Self { uri, owned_by_id }
    }

    #[must_use]
    pub const fn uri(&self) -> &VersionedUri {
        &self.uri
    }

    #[must_use]
    pub const fn owned_by_id(&self) -> OwnedById {
        self.owned_by_id
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct PersistedDataType {
    #[schema(value_type = VAR_DATA_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    inner: DataType,
    metadata: PersistedOntologyMetadata,
}

impl PersistedDataType {
    #[must_use]
    pub const fn inner(&self) -> &DataType {
        &self.inner
    }

    #[must_use]
    pub const fn metadata(&self) -> &PersistedOntologyMetadata {
        &self.metadata
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct PersistedPropertyType {
    #[schema(value_type = VAR_PROPERTY_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    inner: PropertyType,
    metadata: PersistedOntologyMetadata,
}

impl PersistedPropertyType {
    #[must_use]
    pub const fn inner(&self) -> &PropertyType {
        &self.inner
    }

    #[must_use]
    pub const fn metadata(&self) -> &PersistedOntologyMetadata {
        &self.metadata
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersistedOntologyMetadata {
    identifier: PersistedOntologyIdentifier,
    created_by_id: CreatedById,
    updated_by_id: UpdatedById,
    removed_by_id: Option<RemovedById>,
}

impl PersistedOntologyMetadata {
    #[must_use]
    pub const fn new(
        identifier: PersistedOntologyIdentifier,
        created_by_id: CreatedById,
        updated_by_id: UpdatedById,
        removed_by_id: Option<RemovedById>,
    ) -> Self {
        Self {
            identifier,
            created_by_id,
            updated_by_id,
            removed_by_id,
        }
    }

    #[must_use]
    pub const fn identifier(&self) -> &PersistedOntologyIdentifier {
        &self.identifier
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct PersistedEntityType {
    #[schema(value_type = VAR_ENTITY_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    inner: EntityType,
    metadata: PersistedOntologyMetadata,
}

impl PersistedEntityType {
    #[must_use]
    pub const fn inner(&self) -> &EntityType {
        &self.inner
    }

    #[must_use]
    pub const fn metadata(&self) -> &PersistedOntologyMetadata {
        &self.metadata
    }
}

pub trait PersistedOntologyType {
    type Inner;

    fn new(record: Self::Inner, metadata: PersistedOntologyMetadata) -> Self;
}

impl PersistedOntologyType for PersistedDataType {
    type Inner = DataType;

    fn new(record: Self::Inner, metadata: PersistedOntologyMetadata) -> Self {
        Self {
            inner: record,
            metadata,
        }
    }
}

impl PersistedOntologyType for PersistedPropertyType {
    type Inner = PropertyType;

    fn new(record: Self::Inner, metadata: PersistedOntologyMetadata) -> Self {
        Self {
            inner: record,
            metadata,
        }
    }
}

impl PersistedOntologyType for PersistedEntityType {
    type Inner = EntityType;

    fn new(record: Self::Inner, metadata: PersistedOntologyMetadata) -> Self {
        Self {
            inner: record,
            metadata,
        }
    }
}
