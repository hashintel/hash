//! TODO: DOC

pub mod domain_validator;

use core::fmt;

use error_stack::{Context, Result, ResultExt};
use serde::Deserialize;
use type_system::url::VersionedUrl;

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
