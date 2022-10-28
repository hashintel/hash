use std::fmt;

use error_stack::{IntoReport, Report};
use serde::{
    de::{self, Deserializer, SeqAccess, Visitor},
    Deserialize,
};
use type_system::PropertyType;

use crate::{
    ontology::{data_type::DataTypeQueryPathVisitor, DataTypeQueryPath, Selector},
    store::query::{OntologyPath, ParameterType, Path, QueryRecord, RecordPath},
};

#[derive(Debug, PartialEq, Eq)]
pub enum PropertyTypeQueryPath {
    VersionId,
    OwnedById,
    CreatedById,
    UpdatedById,
    RemovedById,
    Schema,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    DataTypes(DataTypeQueryPath),
    PropertyTypes(Box<Self>),
}

impl QueryRecord for PropertyType {
    type Path<'q> = PropertyTypeQueryPath;
}

impl OntologyPath for PropertyTypeQueryPath {
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

impl RecordPath for PropertyTypeQueryPath {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::VersionId | Self::OwnedById | Self::CreatedById | Self::UpdatedById => {
                ParameterType::Uuid
            }
            Self::RemovedById => ParameterType::Uuid,
            Self::Schema => ParameterType::Any,
            Self::BaseUri => ParameterType::BaseUri,
            Self::VersionedUri => ParameterType::VersionedUri,
            Self::Version => ParameterType::UnsignedInteger,
            Self::Title | Self::Description => ParameterType::Text,
            Self::DataTypes(path) => path.expected_type(),
            Self::PropertyTypes(path) => path.expected_type(),
        }
    }
}

impl fmt::Display for PropertyTypeQueryPath {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::VersionId => fmt.write_str("versionId"),
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::CreatedById => fmt.write_str("createdById"),
            Self::UpdatedById => fmt.write_str("updatedById"),
            Self::RemovedById => fmt.write_str("removedById"),
            Self::Schema => fmt.write_str("schema"),
            Self::BaseUri => fmt.write_str("baseUri"),
            Self::VersionedUri => fmt.write_str("versionedUri"),
            Self::Version => fmt.write_str("version"),
            Self::Title => fmt.write_str("title"),
            Self::Description => fmt.write_str("description"),
            Self::DataTypes(path) => write!(fmt, "dataTypes.{path}"),
            Self::PropertyTypes(path) => write!(fmt, "propertyTypes.{path}"),
        }
    }
}

impl TryFrom<Path> for PropertyTypeQueryPath {
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
pub enum PropertyTypeQueryToken {
    OwnedById,
    CreatedById,
    UpdatedById,
    RemovedById,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    DataTypes,
    PropertyTypes,
}

/// Deserializes a [`PropertyTypeQueryPath`] from a string sequence.
pub struct PropertyTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl PropertyTypeQueryPathVisitor {
    pub const EXPECTING: &'static str = "one of `ownedById`, `createdById`, `updatedById`, \
                                         `removedById`, `baseUri`, `versionedUri`, `version`, \
                                         `title`, `description`, `dataTypes`, `propertyTypes`";

    #[must_use]
    pub const fn new(position: usize) -> Self {
        Self { position }
    }
}

impl<'de> Visitor<'de> for PropertyTypeQueryPathVisitor {
    type Value = PropertyTypeQueryPath;

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
            PropertyTypeQueryToken::OwnedById => PropertyTypeQueryPath::OwnedById,
            PropertyTypeQueryToken::CreatedById => PropertyTypeQueryPath::CreatedById,
            PropertyTypeQueryToken::UpdatedById => PropertyTypeQueryPath::UpdatedById,
            PropertyTypeQueryToken::RemovedById => PropertyTypeQueryPath::RemovedById,
            PropertyTypeQueryToken::BaseUri => PropertyTypeQueryPath::BaseUri,
            PropertyTypeQueryToken::VersionedUri => PropertyTypeQueryPath::VersionedUri,
            PropertyTypeQueryToken::Version => PropertyTypeQueryPath::Version,
            PropertyTypeQueryToken::Title => PropertyTypeQueryPath::Title,
            PropertyTypeQueryToken::Description => PropertyTypeQueryPath::Description,
            PropertyTypeQueryToken::DataTypes => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                let data_type_query_path =
                    DataTypeQueryPathVisitor::new(self.position).visit_seq(seq)?;

                PropertyTypeQueryPath::DataTypes(data_type_query_path)
            }
            PropertyTypeQueryToken::PropertyTypes => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                let property_type_query_path = Self::new(self.position).visit_seq(seq)?;

                PropertyTypeQueryPath::PropertyTypes(Box::new(property_type_query_path))
            }
        })
    }
}
impl<'de> Deserialize<'de> for PropertyTypeQueryPath {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(PropertyTypeQueryPathVisitor::new(0))
    }
}

#[cfg(test)]
mod tests {
    use std::iter::once;

    use super::*;
    use crate::query::test_utils::create_path;

    fn convert_path(segments: impl IntoIterator<Item = &'static str>) -> PropertyTypeQueryPath {
        PropertyTypeQueryPath::try_from(create_path(segments)).expect("could not convert path")
    }

    fn deserialize<'q>(segments: impl IntoIterator<Item = &'q str>) -> PropertyTypeQueryPath {
        PropertyTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
            segments.into_iter(),
        ))
        .expect("could not deserialize path")
    }

    #[test]
    fn deserialization() {
        assert_eq!(deserialize(["baseUri"]), PropertyTypeQueryPath::BaseUri);
        assert_eq!(deserialize(["version"]), PropertyTypeQueryPath::Version);
        assert_eq!(
            deserialize(["versionedUri"]),
            PropertyTypeQueryPath::VersionedUri
        );
        assert_eq!(deserialize(["ownedById"]), PropertyTypeQueryPath::OwnedById);
        assert_eq!(deserialize(["title"]), PropertyTypeQueryPath::Title);
        assert_eq!(
            deserialize(["description"]),
            PropertyTypeQueryPath::Description
        );
        assert_eq!(
            deserialize(["dataTypes", "*", "version"]),
            PropertyTypeQueryPath::DataTypes(DataTypeQueryPath::Version)
        );
        assert_eq!(
            deserialize(["propertyTypes", "*", "baseUri"]),
            PropertyTypeQueryPath::PropertyTypes(Box::new(PropertyTypeQueryPath::BaseUri))
        );

        assert_eq!(
            PropertyTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(once("version_id"))
            )
            .expect_err(
                "managed to convert property type query path with hidden token when it should \
                 have errored"
            )
            .to_string(),
            format!(
                "unknown variant `version_id`, expected {}",
                PropertyTypeQueryPathVisitor::EXPECTING
            )
        );

        assert_eq!(
            PropertyTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(once("schema"))
            )
            .expect_err(
                "managed to convert property type query path with hidden token when it should \
                 have errored"
            )
            .to_string(),
            format!(
                "unknown variant `schema`, expected {}",
                PropertyTypeQueryPathVisitor::EXPECTING
            )
        );

        assert_eq!(
            PropertyTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(
                    ["baseUri", "test"].into_iter()
                )
            )
            .expect_err(
                "managed to convert property type query path with multiple tokens when it should \
                 have errored"
            )
            .to_string(),
            "invalid length 2, expected 1 element in sequence"
        );

        assert_eq!(
            PropertyTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(
                    ["dataTypes", "*"].into_iter()
                )
            )
            .expect_err(
                "managed to convert property type query path with multiple tokens when it should \
                 have errored"
            )
            .to_string(),
            format!(
                "invalid length 2, expected {}",
                DataTypeQueryPathVisitor::EXPECTING
            )
        );

        assert_eq!(
            PropertyTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(
                    ["dataTypes", "*", "versionedUri", "invalid"].into_iter()
                )
            )
            .expect_err(
                "managed to convert property type query path with multiple tokens when it should \
                 have errored"
            )
            .to_string(),
            "invalid length 4, expected 3 elements in sequence"
        );
    }

    #[test]
    fn path_conversion() {
        assert_eq!(convert_path(["baseUri"]), PropertyTypeQueryPath::BaseUri);
        assert_eq!(convert_path(["version"]), PropertyTypeQueryPath::Version);
        assert_eq!(
            convert_path(["versionedUri"]),
            PropertyTypeQueryPath::VersionedUri
        );
        assert_eq!(
            convert_path(["ownedById"]),
            PropertyTypeQueryPath::OwnedById
        );
        assert_eq!(convert_path(["title"]), PropertyTypeQueryPath::Title);
        assert_eq!(
            convert_path(["description"]),
            PropertyTypeQueryPath::Description
        );
        assert_eq!(
            convert_path(["dataTypes", "*", "version"]),
            PropertyTypeQueryPath::DataTypes(DataTypeQueryPath::Version)
        );
        assert_eq!(
            convert_path(["propertyTypes", "*", "baseUri"]),
            PropertyTypeQueryPath::PropertyTypes(Box::new(PropertyTypeQueryPath::BaseUri))
        );

        assert_eq!(
            PropertyTypeQueryPath::try_from(create_path(["baseUri", "invalid"]))
                .expect_err("could convert property type query path with multiple tokens")
                .downcast_ref::<de::value::Error>()
                .expect("deserialization error not found in report")
                .to_string(),
            "invalid length 2, expected 1 element in sequence"
        );
    }
}
