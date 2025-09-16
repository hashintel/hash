use core::error::Error;

#[derive(Debug, derive_more::Display)]
pub enum InvalidUuid {
    #[display("Uuid is missing a version")]
    VersionMissing,
    #[display("Uuid does not have a supported variant, only RFC4122 is supported")]
    UnsupportedVariant,
}

impl Error for InvalidUuid {}

use serde::{
    de::{self, Deserialize as _, Deserializer},
    ser::{Serialize as _, Serializer},
};
use uuid::{Uuid, Variant};

/// Serialize a [`Uuid`].
///
/// # Errors
///
/// - If the serialization of the [`Uuid`] fails.
pub fn serialize<S: Serializer>(uuid: &Uuid, serializer: S) -> Result<S::Ok, S::Error> {
    uuid.serialize(serializer)
}

/// Deserialize a [`Uuid`] and validates it.
///
/// # Errors
///
/// - If the deserialization of the uuid fails.
/// - If the uuid is missing a version or variant.
pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Uuid, D::Error> {
    let uuid = Uuid::deserialize(deserializer)?;
    if uuid.get_version().is_none() {
        return Err(de::Error::custom(InvalidUuid::VersionMissing));
    }
    if !matches!(uuid.get_variant(), Variant::RFC4122) {
        return Err(de::Error::custom(InvalidUuid::UnsupportedVariant));
    }
    Ok(uuid)
}
