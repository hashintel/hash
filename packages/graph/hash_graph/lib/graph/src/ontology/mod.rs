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
use crate::provenance::{OwnedById, ProvenanceMetadata};

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

/// Distance to explore when querying a rooted subgraph in the ontology.
///
/// Ontology records may have references to other records, e.g. a [`PropertyType`] may reference
/// other [`PropertyType`]s or [`DataType`]s. The depths provided alongside a query specify how many
/// steps to explore along a chain of references _of a certain kind of type_. Meaning, any chain of
/// property type references will be resolved up to the depth given for property types, and *each*
/// data type referenced in those property types will in turn start a 'new chain' whose exploration
/// depth is limited by the depth given for data types.
///
/// A depth of `0` means that no references are explored for that specific kind of type.
///
/// [`DataType`]: type_system::DataType
/// [`PropertyType`]: type_system::PropertyType
///
/// # Example
///
/// - `EntityType1` references \[`EntityType2`, `PropertyType1`]
/// - `EntityType2` references \[`PropertyType2`]
/// - `PropertyType1` references \[`DataType2`]
/// - `PropertyType2` references \[`PropertyType3`, `DataType1`]
/// - `PropertyType3` references \[`PropertyType4`, `DataType3`]
/// - `PropertyType4` references \[`DataType3`]
///
/// If a query on `EntityType1` is made with the following depths:
/// - `entity_type_query_depth: 1`
/// - `property_type_query_depth: 3`
/// - `data_type_query_depth: 1`
///
/// Then the returned subgraph will be:
/// - `referenced_entity_types`: \[`EntityType2`]
/// - `referenced_property_types`: \[`PropertyType1`, `PropertyType2`, `PropertyType3`]
/// - `referenced_data_types`: \[`DataType1`, `DataType2`]
///
/// ## The idea of "chains"
///
/// When `EntityType2` is explored its referenced property types get explored. The chain of
/// _property type_ references is then resolved to a depth of `property_type_query_depth`.
pub type OntologyQueryDepth = u8;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct DataTypeWithMetadata {
    #[schema(value_type = VAR_DATA_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    inner: DataType,
    metadata: PersistedOntologyMetadata,
}

impl DataTypeWithMetadata {
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
pub struct PropertyTypeWithMetadata {
    #[schema(value_type = VAR_PROPERTY_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    inner: PropertyType,
    metadata: PersistedOntologyMetadata,
}

impl PropertyTypeWithMetadata {
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
    #[serde(rename = "provenance")]
    provenance_metadata: ProvenanceMetadata,
}

impl PersistedOntologyMetadata {
    #[must_use]
    pub const fn new(
        identifier: PersistedOntologyIdentifier,
        provenance_metadata: ProvenanceMetadata,
    ) -> Self {
        Self {
            identifier,
            provenance_metadata,
        }
    }

    #[must_use]
    pub const fn identifier(&self) -> &PersistedOntologyIdentifier {
        &self.identifier
    }

    #[must_use]
    pub const fn provenance_metadata(&self) -> ProvenanceMetadata {
        self.provenance_metadata
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct EntityTypeWithMetadata {
    #[schema(value_type = VAR_ENTITY_TYPE)]
    #[serde(serialize_with = "serialize_ontology_type")]
    inner: EntityType,
    metadata: PersistedOntologyMetadata,
}

impl EntityTypeWithMetadata {
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

impl PersistedOntologyType for DataTypeWithMetadata {
    type Inner = DataType;

    fn new(record: Self::Inner, metadata: PersistedOntologyMetadata) -> Self {
        Self {
            inner: record,
            metadata,
        }
    }
}

impl PersistedOntologyType for PropertyTypeWithMetadata {
    type Inner = PropertyType;

    fn new(record: Self::Inner, metadata: PersistedOntologyMetadata) -> Self {
        Self {
            inner: record,
            metadata,
        }
    }
}

impl PersistedOntologyType for EntityTypeWithMetadata {
    type Inner = EntityType;

    fn new(record: Self::Inner, metadata: PersistedOntologyMetadata) -> Self {
        Self {
            inner: record,
            metadata,
        }
    }
}
