//! Optional fields that reject `null` and empty values.

use serde::{Deserialize, Deserializer};

/// Reads an optional field that the input names.
///
/// Used with `#[serde(default, deserialize_with = "…")]` on an `Option`, a missing field stays
/// `None`, while `null`, and an empty query parameter value, are read as the field's type and
/// rejected unless it accepts them. Without it, both would read as a missing field.
pub(super) fn present<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}
