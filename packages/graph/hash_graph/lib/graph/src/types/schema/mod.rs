pub mod array;
pub mod combinator;
mod data_type;
mod object;
pub mod property_type;

use core::fmt;

#[doc(inline)]
pub use self::{
    combinator::{OneOf, ValueOrArray},
    data_type::DataType,
    property_type::PropertyType,
};
use crate::types::Uri;

#[derive(Debug)]
pub enum ValidationError {
    PropertyRequired(Uri),
    PropertyMissing(usize, usize),
    OneOfEmpty,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::PropertyRequired(uri) => {
                write!(
                    fmt,
                    "The schema has marked the \"{uri}\" property as required, but it wasn't \
                     defined in the `\"properties\"` object"
                )
            }
            Self::PropertyMissing(expected, actual) => {
                write!(
                    fmt,
                    "At least {expected} properties are required, but only {actual} were provided"
                )
            }
            Self::OneOfEmpty => fmt.write_str("`\"one_of\"` must have at least one item"),
        }
    }
}

impl std::error::Error for ValidationError {}

#[cfg(test)]
mod tests {
    use std::fmt::Debug;

    use serde::{Deserialize, Serialize};

    pub(super) fn check_serialization<T>(
        value: &T,
        json: &serde_json::Value,
    ) -> Result<(), serde_json::Error>
    where
        T: Debug + PartialEq + Serialize,
    {
        let serialized_json = serde_json::to_value(value)?;
        assert_eq!(
            &serialized_json, json,
            "Serialized value does not match expected JSON",
        );

        Ok(())
    }

    pub(super) fn check_deserialization<T>(
        value: &T,
        json: serde_json::Value,
    ) -> Result<(), serde_json::Error>
    where
        for<'de> T: Debug + PartialEq + Deserialize<'de>,
    {
        let deserialized_json = serde_json::from_value::<T>(json)?;
        assert_eq!(
            &deserialized_json, value,
            "Deserialized JSON does not match expected value",
        );

        Ok(())
    }

    pub(super) fn check<T>(value: &T, json: serde_json::Value) -> Result<(), serde_json::Error>
    where
        for<'de> T: Debug + PartialEq + Serialize + Deserialize<'de>,
    {
        check_serialization(value, &json)?;
        check_deserialization(value, json)?;
        Ok(())
    }

    pub(super) fn check_invalid_json<T>(json: serde_json::Value)
    where
        for<'de> T: Debug + Deserialize<'de>,
    {
        serde_json::from_value::<T>(json).expect_err("JSON is not allowed to be deserialized");
    }
}
