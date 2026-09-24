use alloc::borrow::Cow;

use http::StatusCode;
use serde::{Deserialize, Deserializer, de::Error as _};

mod serialization;

#[cfg(feature = "aide")]
pub(crate) use self::serialization::STANDARD_MEMBERS;
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

/// Deserializes an HTTP status code between 100 and 599.
///
/// # Errors
///
/// Returns the deserializer's error for a non-integer or an out-of-range status code.
pub(crate) fn deserialize_status<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<StatusCode, D::Error> {
    let status = u16::deserialize(deserializer)?;
    if !(100..=599).contains(&status) {
        return Err(D::Error::custom(format_args!(
            "problem status code {status} is outside 100..=599"
        )));
    }
    StatusCode::from_u16(status).map_err(D::Error::custom)
}
