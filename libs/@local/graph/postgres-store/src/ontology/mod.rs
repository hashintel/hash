//! TODO: DOC.

use core::{error::Error, fmt};

use error_stack::{Report, ResultExt as _};
use serde::Deserialize;
use type_system::ontology::VersionedUrl;

#[derive(Debug)]
pub struct PatchAndParseError;

impl Error for PatchAndParseError {}

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
) -> Result<T, Report<PatchAndParseError>>
where
    for<'de> T: Deserialize<'de>,
{
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "$id".to_owned(),
            serde_json::to_value(id).expect("failed to deserialize id"),
        );
        serde_json::from_value(value).change_context(PatchAndParseError)
    } else {
        Err(PatchAndParseError)
            .attach("unexpected schema format, couldn't parse as object")
            .attach(value)
    }
}
