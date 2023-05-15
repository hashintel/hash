#![expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "Only used in serde attribute"
)]

use serde::de::{Deserialize, Deserializer};

pub(crate) fn optional<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

pub(crate) mod default_minus_one {
    use alloc::format;
    use core::fmt::Display;

    use serde::{de::Error, Deserialize, Deserializer, Serialize, Serializer};

    pub(crate) fn serialize<S, T>(value: &Option<T>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
        T: Serialize,
    {
        match value {
            Some(value) => value.serialize(serializer),
            None => (-1_isize).serialize(serializer),
        }
    }

    pub(crate) fn deserialize<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
    where
        D: Deserializer<'de>,
        T: Deserialize<'de> + TryFrom<i128>,
        T::Error: Display,
    {
        let value = i128::deserialize(deserializer)?;
        if value == -1 {
            Ok(None)
        } else {
            T::try_from(value).map(Some).map_err(|error| {
                Error::custom(format!(
                    "invalid value `{value}`, expected positive integral value or `-1`: {error}"
                ))
            })
        }
    }
}

pub(crate) mod rank {
    use alloc::format;

    use serde::{de::Error, Deserialize, Deserializer, Serialize, Serializer};

    pub(crate) fn serialize<S>(value: &Option<u8>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(value) => value.serialize(serializer),
            None => (-1_i8).serialize(serializer),
        }
    }

    pub(crate) fn deserialize<'de, D>(deserializer: D) -> Result<Option<u8>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = i8::deserialize(deserializer)?;
        if value == -1 {
            Ok(None)
        } else {
            if value > 100 {
                return Err(Error::custom(format!(
                    "invalid value `{value}`, expected positive integral between 0 and 100 or \
                     `-1`: value is greater than 100",
                )));
            }

            u8::try_from(value).map(Some).map_err(|error| {
                Error::custom(format!(
                    "invalid value `{value}`, expected positive integral between 0 and 100 or \
                     `-1`: {error}"
                ))
            })
        }
    }
}

pub(crate) fn is_default<T: Default + PartialEq>(value: &T) -> bool {
    T::default().eq(value)
}

pub(crate) const fn default_true() -> bool {
    true
}

pub(crate) const fn is_true(value: &bool) -> bool {
    *value
}
