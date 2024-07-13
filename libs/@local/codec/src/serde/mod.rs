pub mod string_hash_map;

mod size_hint;

use ::time::format_description::well_known::{iso8601, Iso8601};

const CONFIG: iso8601::EncodedConfig = iso8601::Config::DEFAULT
    .set_year_is_six_digits(false)
    .encode();
const FORMAT: Iso8601<CONFIG> = Iso8601::<CONFIG>;
::time::serde::format_description!(time_format, OffsetDateTime, FORMAT);

// The macro above creates a private macro so we re-export it here publicly.
pub mod time {
    pub use super::time_format::*;

    pub mod option {
        pub use super::super::time_format::option::*;
    }
}

pub mod regex {
    use regex::Regex;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    /// Serialize a [`Regex`] to a string.
    ///
    /// # Errors
    ///
    /// - If the serialization of the string fails.
    pub fn serialize<S: Serializer>(regex: &Regex, serializer: S) -> Result<S::Ok, S::Error> {
        regex.as_str().serialize(serializer)
    }

    /// Deserialize a [`Regex`] from a string.
    ///
    /// # Errors
    ///
    /// - If the deserialization of the string fails.
    /// - If the regex pattern is invalid.
    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Regex, D::Error> {
        Regex::new(&String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }

    pub mod option {
        use regex::Regex;
        use serde::{Deserialize, Deserializer, Serialize, Serializer};

        /// Serialize an optional [`Regex`] to a string.
        ///
        /// # Errors
        ///
        /// - If the serialization of the string fails.
        pub fn serialize<S: Serializer>(
            regex: &Option<Regex>,
            serializer: S,
        ) -> Result<S::Ok, S::Error> {
            regex.as_ref().map(Regex::as_str).serialize(serializer)
        }

        /// Deserialize a [`Regex`] from an optional string.
        ///
        /// # Errors
        ///
        /// - If the deserialization of the string fails.
        /// - If the regex pattern is invalid.
        pub fn deserialize<'de, D: Deserializer<'de>>(
            deserializer: D,
        ) -> Result<Option<Regex>, D::Error> {
            let Some(pattern) = Option::<String>::deserialize(deserializer)? else {
                return Ok(None);
            };
            Regex::new(&pattern)
                .map_err(serde::de::Error::custom)
                .map(Some)
        }
    }
}
