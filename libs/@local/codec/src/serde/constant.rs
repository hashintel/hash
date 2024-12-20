use core::fmt;

use serde::{
    de::{self, Deserialize, Deserializer, Unexpected, Visitor},
    ser::{Serialize, Serializer},
};

/// A `bool` constant.
///
/// Deserialization fails if the value is not `B`.
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
