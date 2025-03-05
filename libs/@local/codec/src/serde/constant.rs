use core::fmt;

use serde::{
    de::{self, Deserialize, Deserializer, Unexpected, Visitor},
    ser::{Serialize, Serializer},
};

/// A compile-time boolean constant type that only deserializes successfully if the value
/// matches the const generic parameter `V`.
///
/// This type is useful for schema validation with serde, ensuring that serialized data
/// contains specific constant boolean values at specific places. It's a zero-sized type
/// that enforces invariants during deserialization.
///
/// # Examples
///
/// ```
/// use hash_codec::serde::constant::ConstBool;
/// use serde::{Deserialize, Serialize};
///
/// #[derive(Serialize, Deserialize)]
/// struct ApiConfig {
///     #[serde(rename = "api_version")]
///     _api_version: ConstBool<true>,
///     // Other fields...
/// }
///
/// // This will succeed - value matches const parameter
/// let json = r#"{"api_version": true}"#;
/// let config: ApiConfig = serde_json::from_str(json).unwrap();
///
/// // This will fail - value doesn't match const parameter
/// let json = r#"{"api_version": false}"#;
/// let result: Result<ApiConfig, _> = serde_json::from_str(json);
/// assert!(result.is_err());
/// ```
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd, Eq, Ord, Hash, Default)]
pub struct ConstBool<const V: bool>;

impl<const V: bool> Serialize for ConstBool<V> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_bool(V)
    }
}

impl<'de, const V: bool> Deserialize<'de> for ConstBool<V> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_bool(ConstBoolVisitor::<V>)
    }
}

/// Visitor implementation for [`ConstBool`] that only accepts the constant value `V`.
struct ConstBoolVisitor<const V: bool>;

impl<const V: bool> Visitor<'_> for ConstBoolVisitor<V> {
    type Value = ConstBool<V>;

    fn expecting(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{V}")
    }

    fn visit_bool<E>(self, boolean: bool) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if boolean == V {
            Ok(ConstBool::<V>)
        } else {
            Err(E::invalid_value(Unexpected::Bool(boolean), &self))
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{from_value, json, to_value};

    use super::*;

    #[test]
    fn test_const_bool_serialize() {
        // Test serialization
        let value = ConstBool::<true>;
        let serialized = to_value(value).expect("Failed to serialize ConstBool<true>");
        assert_eq!(serialized, json!(true));

        let value = ConstBool::<false>;
        let serialized = to_value(value).expect("Failed to serialize ConstBool<false>");
        assert_eq!(serialized, json!(false));
    }

    #[test]
    fn test_const_bool_deserialize_success() {
        // Test successful deserialization
        let value: ConstBool<true> =
            from_value(json!(true)).expect("Failed to deserialize ConstBool<true>");
        assert_eq!(value, ConstBool::<true>);

        let value: ConstBool<false> =
            from_value(json!(false)).expect("Failed to deserialize ConstBool<false>");
        assert_eq!(value, ConstBool::<false>);
    }

    #[test]
    fn test_const_bool_deserialize_failure() {
        // Test failed deserialization
        let result = from_value::<ConstBool<true>>(json!(false));
        let _: serde_json::Error = result.expect_err("ConstBool<true> should reject false value");

        let result = from_value::<ConstBool<false>>(json!(true));
        let _: serde_json::Error = result.expect_err("ConstBool<false> should reject true value");
    }
}
