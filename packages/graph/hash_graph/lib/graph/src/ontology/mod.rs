//! TODO: DOC

mod data_type;
pub mod domain_validator;
mod entity_type;
mod link_type;
mod property_type;

use core::fmt;

use error_stack::{Context, IntoReport, Result, ResultExt};
use serde_json;
use type_system::uri::VersionedUri;

pub use self::{
    data_type::DataTypeQueryPath, entity_type::EntityTypeQueryPath, link_type::LinkTypeQueryPath,
    property_type::PropertyTypeQueryPath,
};

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
/// - `EntityType1` references \[`EntityType2`, `PropertyType1`, `LinkType1`]
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
/// - `link_type_query_depth: 0`
///
/// Then the returned subgraph will be:
/// - `referenced_entity_types`: \[`EntityType2`]
/// - `referenced_property_types`: \[`PropertyType1`, `PropertyType2`, `PropertyType3`]
/// - `referenced_data_types`: \[`DataType1`, `DataType2`]
/// - `referenced_link_types`: \[]
///
/// ## The idea of "chains"
///
/// When `EntityType2` is explored its referenced property types get explored. The chain of
/// _property type_ references is then resolved to a depth of `property_type_query_depth`.
pub type OntologyQueryDepth = u8;

#[cfg(test)]
mod test_utils {
    use crate::store::query::{Path, PathSegment};

    pub fn create_path(segments: impl IntoIterator<Item = &'static str>) -> Path {
        Path {
            segments: segments
                .into_iter()
                .map(|segment| PathSegment {
                    identifier: segment.to_owned(),
                })
                .collect(),
        }
    }
}
