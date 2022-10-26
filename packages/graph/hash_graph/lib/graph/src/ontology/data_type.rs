use std::fmt;

use error_stack::{IntoReport, Report};
use serde::{
    de::{self, Deserializer, SeqAccess, Visitor},
    Deserialize,
};
use type_system::DataType;

use crate::store::query::{
    OntologyPath, ParameterField, ParameterType, Path, QueryRecord, RecordPath,
};

/// A path to a [`DataType`] field.
///
/// Note: [`DataType`]s currently don't reference other [`DataType`]s, so the path can only be a
/// single field.
///
/// [`DataType`]: type_system::DataType
// TODO: Adjust enum and docs when adding non-primitive data types
//   see https://app.asana.com/0/1200211978612931/1202464168422955/f
#[derive(Debug, PartialEq, Eq)]
pub enum DataTypeQueryPath {
    OwnedById,
    CreatedById,
    UpdatedById,
    RemovedById,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    Type,
}

impl QueryRecord for DataType {
    type Path<'q> = DataTypeQueryPath;
}

impl OntologyPath for DataTypeQueryPath {
    fn base_uri() -> Self {
        Self::BaseUri
    }

    fn versioned_uri() -> Self {
        Self::VersionedUri
    }

    fn version() -> Self {
        Self::Version
    }

    fn title() -> Self {
        Self::Title
    }

    fn description() -> Self {
        Self::Description
    }
}

impl RecordPath for DataTypeQueryPath {
    fn expected_type(&self) -> ParameterField {
        match self {
            Self::OwnedById | Self::CreatedById | Self::UpdatedById => ParameterField {
                parameter_type: ParameterType::Uuid,
                optional: false,
            },
            Self::RemovedById => ParameterField {
                parameter_type: ParameterType::Uuid,
                optional: true,
            },
            Self::BaseUri => ParameterField {
                parameter_type: ParameterType::BaseUri,
                optional: false,
            },
            Self::VersionedUri => ParameterField {
                parameter_type: ParameterType::VersionedUri,
                optional: false,
            },
            Self::Version => ParameterField {
                parameter_type: ParameterType::UnsignedInteger,
                optional: false,
            },
            Self::Description => ParameterField {
                parameter_type: ParameterType::Text,
                optional: true,
            },
            Self::Title | Self::Type => ParameterField {
                parameter_type: ParameterType::Text,
                optional: false,
            },
        }
    }
}

impl fmt::Display for DataTypeQueryPath {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::CreatedById => fmt.write_str("createdById"),
            Self::UpdatedById => fmt.write_str("updatedById"),
            Self::RemovedById => fmt.write_str("removedById"),
            Self::BaseUri => fmt.write_str("baseUri"),
            Self::VersionedUri => fmt.write_str("versionedUri"),
            Self::Version => fmt.write_str("version"),
            Self::Title => fmt.write_str("title"),
            Self::Description => fmt.write_str("description"),
            Self::Type => fmt.write_str("type"),
        }
    }
}

impl TryFrom<Path> for DataTypeQueryPath {
    type Error = Report<de::value::Error>;

    fn try_from(path: Path) -> Result<Self, Self::Error> {
        Self::deserialize(de::value::SeqDeserializer::new(
            path.segments.into_iter().map(|segment| segment.identifier),
        ))
        .into_report()
    }
}

/// A single token in a [`DataTypeQueryPath`].
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum DataTypeQueryToken {
    OwnedById,
    CreatedById,
    UpdatedById,
    RemovedById,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    Type,
}

/// Deserializes a [`DataTypeQueryPath`] from a string sequence.
pub struct DataTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl DataTypeQueryPathVisitor {
    pub const EXPECTING: &'static str = "one of `ownedById`, `baseUri`, `versionedUri`, \
                                         `version`, `title, `description`, `type`, or a custom \
                                         identifier";

    #[must_use]
    pub const fn new(position: usize) -> Self {
        Self { position }
    }
}

impl<'de> Visitor<'de> for DataTypeQueryPathVisitor {
    type Value = DataTypeQueryPath;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str(Self::EXPECTING)
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
            DataTypeQueryToken::CreatedById => DataTypeQueryPath::CreatedById,
            DataTypeQueryToken::UpdatedById => DataTypeQueryPath::UpdatedById,
            DataTypeQueryToken::RemovedById => DataTypeQueryPath::RemovedById,
            DataTypeQueryToken::BaseUri => DataTypeQueryPath::BaseUri,
            DataTypeQueryToken::VersionedUri => DataTypeQueryPath::VersionedUri,
            DataTypeQueryToken::Version => DataTypeQueryPath::Version,
            DataTypeQueryToken::Title => DataTypeQueryPath::Title,
            DataTypeQueryToken::Description => DataTypeQueryPath::Description,
            DataTypeQueryToken::Type => DataTypeQueryPath::Type,
        })
    }
}

impl<'de> Deserialize<'de> for DataTypeQueryPath {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(DataTypeQueryPathVisitor::new(0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ontology::test_utils::create_path;

    fn convert_path(segments: impl IntoIterator<Item = &'static str>) -> DataTypeQueryPath {
        DataTypeQueryPath::try_from(create_path(segments)).expect("could not convert path")
    }

    fn deserialize<'q>(segments: impl IntoIterator<Item = &'q str>) -> DataTypeQueryPath {
        DataTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
            segments.into_iter(),
        ))
        .expect("could not deserialize path")
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
            DataTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
                ["baseUri", "test"].into_iter()
            ))
            .expect_err("could convert data type query path with multiple tokens")
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
            DataTypeQueryPath::try_from(create_path(["baseUri", "invalid"]))
                .expect_err("could convert data type query path with multiple tokens")
                .downcast_ref::<de::value::Error>()
                .expect("deserialization error not found in report")
                .to_string(),
            "invalid length 2, expected 1 element in sequence"
        );
    }
}
