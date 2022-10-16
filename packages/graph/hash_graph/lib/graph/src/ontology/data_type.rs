use std::{borrow::Cow, fmt};

use error_stack::{IntoReport, Report};
use serde::{
    de::{self, Deserializer, IntoDeserializer, SeqAccess, Visitor},
    Deserialize,
};
use type_system::DataType;

use crate::store::query::{Path, QueryRecord};

/// A path to a [`DataType`] field.
///
/// Note: [`DataType`]s currently don't reference other [`DataType`]s, so the path can only be a
/// single field.
///
/// [`DataType`]: type_system::DataType
// TODO: Adjust enum and docs when adding non-primitive data types
//   see https://app.asana.com/0/1200211978612931/1202464168422955/f
#[derive(Debug, PartialEq, Eq)]
pub enum DataTypeQueryPath<'q> {
    OwnedById,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    Type,
    Custom(Cow<'q, str>),
}

impl<'q> TryFrom<Path> for DataTypeQueryPath<'q> {
    type Error = Report<de::value::Error>;

    fn try_from(path: Path) -> Result<Self, Self::Error> {
        Self::deserialize(de::value::SeqDeserializer::new(
            path.segments.into_iter().map(|segment| segment.identifier),
        ))
        .into_report()
    }
}

/// A single token in a [`DataTypeQueryPath`].
enum DataTypeQueryToken<'q> {
    OwnedById,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    Type,
    Custom(Cow<'q, str>),
}

/// Deserializes a [`DataTypeQueryToken`] from a string.
struct DataTypeQueryTokenVisitor;

fn deserialize_builtin_token<E: de::Error>(s: &str) -> Result<DataTypeQueryToken<'static>, E> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    enum BuiltInDataTypeQueryToken {
        OwnedById,
        BaseUri,
        VersionedUri,
        Version,
        Title,
        Description,
        Type,
    }

    Ok(
        match BuiltInDataTypeQueryToken::deserialize(s.into_deserializer())? {
            BuiltInDataTypeQueryToken::OwnedById => DataTypeQueryToken::OwnedById,
            BuiltInDataTypeQueryToken::BaseUri => DataTypeQueryToken::BaseUri,
            BuiltInDataTypeQueryToken::VersionedUri => DataTypeQueryToken::VersionedUri,
            BuiltInDataTypeQueryToken::Version => DataTypeQueryToken::Version,
            BuiltInDataTypeQueryToken::Title => DataTypeQueryToken::Title,
            BuiltInDataTypeQueryToken::Description => DataTypeQueryToken::Description,
            BuiltInDataTypeQueryToken::Type => DataTypeQueryToken::Type,
        },
    )
}

impl<'de> Visitor<'de> for DataTypeQueryTokenVisitor {
    type Value = DataTypeQueryToken<'de>;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str(
            "one of `ownedById`, `baseUri`, `versionedUri`, `version`, `title, `description`, \
             `type`, or a custom identifier",
        )
    }

    fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
        Ok(deserialize_builtin_token::<E>(v)
            .unwrap_or_else(|_| DataTypeQueryToken::Custom(Cow::Owned(v.to_owned()))))
    }

    fn visit_borrowed_str<E: de::Error>(self, v: &'de str) -> Result<Self::Value, E> {
        Ok(deserialize_builtin_token::<E>(v)
            .unwrap_or(DataTypeQueryToken::Custom(Cow::Borrowed(v))))
    }

    fn visit_string<E: de::Error>(self, v: String) -> Result<Self::Value, E> {
        Ok(deserialize_builtin_token::<E>(v.as_str())
            .unwrap_or(DataTypeQueryToken::Custom(Cow::Owned(v))))
    }

    fn visit_bytes<E: de::Error>(self, v: &[u8]) -> Result<Self::Value, E> {
        match core::str::from_utf8(v) {
            Ok(s) => self.visit_str(s),
            Err(_) => Err(E::invalid_value(de::Unexpected::Bytes(v), &self)),
        }
    }

    fn visit_borrowed_bytes<E: de::Error>(self, v: &'de [u8]) -> Result<Self::Value, E> {
        match core::str::from_utf8(v) {
            Ok(s) => self.visit_borrowed_str(s),
            Err(_) => Err(E::invalid_value(de::Unexpected::Bytes(v), &self)),
        }
    }

    fn visit_byte_buf<E: de::Error>(self, v: Vec<u8>) -> Result<Self::Value, E> {
        match String::from_utf8(v) {
            Ok(s) => self.visit_string(s),
            Err(e) => Err(E::invalid_value(
                de::Unexpected::Bytes(&e.into_bytes()),
                &self,
            )),
        }
    }
}

/// Deserializes a [`DataTypeQueryPath`] from a string sequence.
pub struct DataTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

// In order to create `Cow::Borrowed`, we need to implement it manually
impl<'de: 'k, 'k> Deserialize<'de> for DataTypeQueryToken<'k> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_str(DataTypeQueryTokenVisitor)
    }
}

impl<'de> Visitor<'de> for DataTypeQueryPathVisitor {
    type Value = DataTypeQueryPath<'de>;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str(
            "a sequence containing one element of `ownedById`, `baseUri`, `versionedUri`, \
             `version`, `title, `description`, `type`, or a custom identifier",
        )
    }

    fn visit_seq<A>(mut self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let token = seq
            .next_element()?
            .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
        self.position += 1;
        Ok(match token {
            DataTypeQueryToken::OwnedById => DataTypeQueryPath::OwnedById,
            DataTypeQueryToken::BaseUri => DataTypeQueryPath::BaseUri,
            DataTypeQueryToken::VersionedUri => DataTypeQueryPath::VersionedUri,
            DataTypeQueryToken::Version => DataTypeQueryPath::Version,
            DataTypeQueryToken::Title => DataTypeQueryPath::Title,
            DataTypeQueryToken::Description => DataTypeQueryPath::Description,
            DataTypeQueryToken::Type => DataTypeQueryPath::Type,
            DataTypeQueryToken::Custom(token) => DataTypeQueryPath::Custom(token),
        })
    }
}

impl<'de: 'k, 'k> Deserialize<'de> for DataTypeQueryPath<'k> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(DataTypeQueryPathVisitor { position: 0 })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::query::PathSegment;

    fn create_path(segments: impl IntoIterator<Item = &'static str>) -> Path {
        Path {
            segments: segments
                .into_iter()
                .map(|segment| PathSegment {
                    identifier: segment.to_owned(),
                })
                .collect(),
        }
    }

    fn convert_path(
        segments: impl IntoIterator<Item = &'static str>,
    ) -> DataTypeQueryPath<'static> {
        DataTypeQueryPath::try_from(create_path(segments)).expect("Could not convert path")
    }

    fn deserialize<'q>(segments: impl IntoIterator<Item = &'q str>) -> DataTypeQueryPath<'q> {
        DataTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
            segments.into_iter(),
        ))
        .expect("Could not deserialize path")
    }

    #[test]
    fn deserialization() {
        assert_eq!(deserialize(["baseUri"]), DataTypeQueryPath::BaseUri);
        assert_eq!(deserialize(["version"]), DataTypeQueryPath::Version);
        assert_eq!(
            deserialize(["versionedUri"]),
            DataTypeQueryPath::VersionedUri
        );
        assert_eq!(deserialize(["ownedById"]), DataTypeQueryPath::OwnedById);
        assert_eq!(deserialize(["type"]), DataTypeQueryPath::Type);
        assert_eq!(deserialize(["title"]), DataTypeQueryPath::Title);
        assert_eq!(deserialize(["description"]), DataTypeQueryPath::Description);
        assert_eq!(
            deserialize(["custom"]),
            DataTypeQueryPath::Custom(Cow::Borrowed("custom"))
        );

        assert_eq!(
            DataTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
                ["baseUri", "test"].into_iter()
            ))
            .expect_err("Could convert data type query path with multiple tokens")
            .to_string(),
            "invalid length 2, expected 1 element in sequence"
        );
    }

    #[test]
    fn path_conversion() {
        assert_eq!(convert_path(["baseUri"]), DataTypeQueryPath::BaseUri);
        assert_eq!(convert_path(["version"]), DataTypeQueryPath::Version);
        assert_eq!(
            convert_path(["versionedUri"]),
            DataTypeQueryPath::VersionedUri
        );
        assert_eq!(convert_path(["ownedById"]), DataTypeQueryPath::OwnedById);
        assert_eq!(convert_path(["type"]), DataTypeQueryPath::Type);
        assert_eq!(convert_path(["title"]), DataTypeQueryPath::Title);
        assert_eq!(
            convert_path(["description"]),
            DataTypeQueryPath::Description
        );
        assert_eq!(
            convert_path(["custom"]),
            DataTypeQueryPath::Custom(Cow::Borrowed("custom"))
        );

        assert_eq!(
            DataTypeQueryPath::try_from(create_path(["baseUri", "invalid"]))
                .expect_err("Could convert data type query path with multiple tokens")
                .downcast_ref::<de::value::Error>()
                .expect("deserialization error not found in report")
                .to_string(),
            "invalid length 2, expected 1 element in sequence"
        );
    }
}

impl QueryRecord for DataType {
    type Path<'q> = DataTypeQueryPath<'q>;
}
