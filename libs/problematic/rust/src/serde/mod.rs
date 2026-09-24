use alloc::borrow::Cow;

use serde::{Deserialize, Deserializer};

mod serialization;

pub(crate) use self::serialization::{serialize_extensions, serialize_status};

// Serde enables borrowing for a direct Cow field, but not for Cow nested inside Option.
#[derive(Deserialize)]
#[serde(transparent)]
struct BorrowCow<'a>(#[serde(borrow)] Cow<'a, str>);

/// Borrows optional strings when the deserializer can lend them.
///
/// # Errors
///
/// Returns the deserializer's error if the value is neither a string nor null.
pub(crate) fn deserialize_optional_cow<'de: 'a, 'a, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Cow<'a, str>>, D::Error> {
    Option::<BorrowCow<'a>>::deserialize(deserializer).map(|value| value.map(|value| value.0))
}
