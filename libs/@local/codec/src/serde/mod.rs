pub mod constant;
pub mod string_hash_map;

mod size_hint;

use ::time::format_description::well_known::{Iso8601, iso8601};

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
    use serde::{Deserialize as _, Deserializer, Serialize as _, Serializer};

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
        use serde::{Deserialize as _, Deserializer, Serialize as _, Serializer};

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

    pub mod iter {
        use alloc::borrow::Cow;

        use regex::Regex;
        use serde::{Deserialize as _, Deserializer, Serializer, ser::SerializeSeq as _};

        /// Serialize a sequence of [`Regex`]es.
        ///
        /// # Errors
        ///
        /// - If the serialization of the string fails.
        pub fn serialize<'r, S: Serializer>(
            iter: impl IntoIterator<Item = &'r Regex>,
            serializer: S,
        ) -> Result<S::Ok, S::Error> {
            let iter = iter.into_iter();
            let mut seq = serializer.serialize_seq(Some(iter.size_hint().0))?;
            for regex in iter {
                seq.serialize_element(&regex.as_str())?;
            }
            seq.end()
        }

        /// Deserialize a [`Regex`] from a sequence.
        ///
        /// # Errors
        ///
        /// - If the deserialization of the string fails.
        /// - If the regex pattern is invalid.
        pub fn deserialize<'de, D: Deserializer<'de>, I: FromIterator<Regex>>(
            deserializer: D,
        ) -> Result<I, D::Error> {
            let patterns = Vec::<Cow<'de, str>>::deserialize(deserializer)?;
            patterns
                .into_iter()
                .map(|pattern| Regex::new(&pattern).map_err(serde::de::Error::custom))
                .collect()
        }
    }
}
