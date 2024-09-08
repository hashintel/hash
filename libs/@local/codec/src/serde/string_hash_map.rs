//! Serialization and deserialization for a map which uses strings as keys in the serialized
//! representation.
//!
//! This module provides a serializer and deserializer for [`HashMap`]s where the keys are
//! represented as strings in the serialized form. This is useful when the keys are not strings
//! themselves, but can be converted to and from strings.
//!
//! # Example
//!
//! ```rust
//! use std::collections::HashMap;
//!
//! use serde::{Deserialize, Serialize};
//! use serde_json::json;
//!
//! #[derive(Debug, PartialEq, Serialize, Deserialize)]
//! struct MyStruct {
//!     #[serde(with = "codec::serde::string_hash_map")]
//!     map: HashMap<u32, String>,
//! }
//!
//! let my_struct = MyStruct {
//!     map: HashMap::from([(1, "one".to_owned()), (2, "two".to_owned())]),
//! };
//!
//! let serialized = serde_json::to_value(&my_struct)?;
//! assert_eq!(serialized, json!({"map":{ "1": "one", "2": "two" }}));
//!
//! let deserialized: MyStruct = serde_json::from_value(serialized)?;
//! assert_eq!(deserialized, my_struct);
//! # Ok::<_, serde_json::Error>(())
//! ```

use core::{
    fmt::{self, Display},
    hash::{BuildHasher, Hash},
    marker::PhantomData,
    str::FromStr,
};
use std::collections::HashMap;

use serde::{
    de::{self, Deserialize, DeserializeSeed, Deserializer, MapAccess, Visitor},
    Serialize, Serializer,
};

use crate::serde::size_hint;

/// The default serializer for [`HashMap`].
///
/// This is only here to allow the use of `#[serde(with = "string_hash_map")]`.
///
/// # Errors
///
/// This function can return any error that can be returned by serializing a [`HashMap`].
#[inline]
pub fn serialize<K, V, H, S>(map: &HashMap<K, V, H>, serializer: S) -> Result<S::Ok, S::Error>
where
    HashMap<K, V, H>: Serialize,
    S: Serializer,
{
    map.serialize(serializer)
}

/// Deserialize a [`HashMap`] with keys that implement [`FromStr`].
///
/// # Errors
///
/// In addition to the errors that can be returned by deserializing a [`HashMap`], this function
/// can also return an error if the key cannot be parsed from a string.
// Taken from https://github.com/serde-rs/json/issues/560#issuecomment-532054058
pub fn deserialize<'de, K, V, S, D>(deserializer: D) -> Result<HashMap<K, V, S>, D::Error>
where
    K: Eq + Hash + FromStr,
    K::Err: Display,
    V: Deserialize<'de>,
    S: BuildHasher + Default,
    D: Deserializer<'de>,
{
    struct KeySeed<K> {
        key: PhantomData<K>,
    }

    impl<'de, K> Visitor<'de> for KeySeed<K>
    where
        K: FromStr,
        K::Err: Display,
    {
        type Value = K;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a string")
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            K::from_str(value).map_err(de::Error::custom)
        }
    }

    impl<'de, K> DeserializeSeed<'de> for KeySeed<K>
    where
        K: FromStr,
        K::Err: Display,
    {
        type Value = K;

        fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
        where
            D: Deserializer<'de>,
        {
            deserializer.deserialize_str(self)
        }
    }

    struct MapVisitor<K, V, S> {
        marker: PhantomData<HashMap<K, V, S>>,
    }

    impl<'de, K, V, S> Visitor<'de> for MapVisitor<K, V, S>
    where
        K: Eq + Hash + FromStr,
        K::Err: Display,
        V: Deserialize<'de>,
        S: BuildHasher + Default,
    {
        type Value = HashMap<K, V, S>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: MapAccess<'de>,
        {
            let mut values = HashMap::with_capacity_and_hasher(
                size_hint::cautious::<(K, V)>(map.size_hint()),
                S::default(),
            );
            while let Some((key, value)) =
                map.next_entry_seed(KeySeed { key: PhantomData }, PhantomData)?
            {
                values.insert(key, value);
            }
            Ok(values)
        }
    }

    deserializer.deserialize_map(MapVisitor {
        marker: PhantomData,
    })
}
