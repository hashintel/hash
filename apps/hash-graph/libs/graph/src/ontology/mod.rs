//! TODO: DOC

mod data_type;
pub mod domain_validator;
mod entity_type;
mod property_type;

use core::fmt;

use error_stack::{Context, Result, ResultExt};
use graph_types::ontology::{
    DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata,
};
use serde::Deserialize;
use serde_json;
use temporal_versioning::TimeAxis;
use type_system::url::VersionedUrl;
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

pub use self::{
    data_type::{DataTypeQueryPath, DataTypeQueryPathVisitor, DataTypeQueryToken},
    entity_type::{EntityTypeQueryPath, EntityTypeQueryPathVisitor, EntityTypeQueryToken},
    property_type::{PropertyTypeQueryPath, PropertyTypeQueryPathVisitor, PropertyTypeQueryToken},
};
use crate::{
    store::Record,
    subgraph::identifier::{DataTypeVertexId, EntityTypeVertexId, PropertyTypeVertexId},
};

#[derive(Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
pub enum Selector {
    #[serde(rename = "*")]
    Asterisk,
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
/// field), inserts the given [`VersionedUrl`] under the "$id" key, and tries to deserialize the
/// type.
///
/// # Errors
///
/// - [`PatchAndParseError`] if
///   - "$id" already existed
///   - the [`serde_json::Value`] wasn't an 'Object'
///   - deserializing into `T` failed
///
/// # Panics
///
/// - if serializing the given [`VersionedUrl`] fails
pub fn patch_id_and_parse<T>(
    id: &VersionedUrl,
    mut value: serde_json::Value,
) -> Result<T, PatchAndParseError>
where
    for<'de> T: Deserialize<'de>,
{
    if let Some(object) = value.as_object_mut() {
        if let Some(previous_val) = object.insert(
            "$id".to_owned(),
            serde_json::to_value(id).expect("failed to deserialize id"),
        ) {
            return Err(PatchAndParseError)
                .attach_printable("schema already had an $id")
                .attach_printable(previous_val);
        }
    } else {
        return Err(PatchAndParseError)
            .attach_printable("unexpected schema format, couldn't parse as object")
            .attach_printable(value);
    }

    serde_json::from_value(value).change_context(PatchAndParseError)
}

impl Record for DataTypeWithMetadata {
    type QueryPath<'p> = DataTypeQueryPath<'p>;
    type VertexId = DataTypeVertexId;

    #[must_use]
    fn vertex_id(&self, _time_axis: TimeAxis) -> DataTypeVertexId {
        let record_id = &self.metadata.record_id;
        DataTypeVertexId {
            base_id: record_id.base_url.clone(),
            revision_id: record_id.version,
        }
    }
}

impl Record for PropertyTypeWithMetadata {
    type QueryPath<'p> = PropertyTypeQueryPath<'p>;
    type VertexId = PropertyTypeVertexId;

    #[must_use]
    fn vertex_id(&self, _time_axis: TimeAxis) -> PropertyTypeVertexId {
        let record_id = &self.metadata.record_id;
        PropertyTypeVertexId {
            base_id: record_id.base_url.clone(),
            revision_id: record_id.version,
        }
    }
}

impl Record for EntityTypeWithMetadata {
    type QueryPath<'p> = EntityTypeQueryPath<'p>;
    type VertexId = EntityTypeVertexId;

    #[must_use]
    fn vertex_id(&self, _time_axis: TimeAxis) -> EntityTypeVertexId {
        let record_id = &self.metadata.record_id;
        EntityTypeVertexId {
            base_id: record_id.base_url.clone(),
            revision_id: record_id.version,
        }
    }
}
