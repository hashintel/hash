use std::fmt;

use error_stack::{IntoReport, Report};
use serde::{
    de::{self, Deserializer, SeqAccess, Visitor},
    Deserialize,
};
use type_system::LinkType;

use crate::store::query::{ParameterField, ParameterType, Path, QueryRecord, RecordPath};

#[derive(Debug, PartialEq, Eq)]
pub enum LinkTypeQueryPath {
    OwnedById,
    CreatedById,
    UpdatedById,
    RemovedById,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    RelatedKeywords,
}

impl QueryRecord for LinkType {
    type Path<'q> = LinkTypeQueryPath;
}

impl RecordPath for LinkTypeQueryPath {
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
            Self::Title | Self::Description => ParameterField {
                parameter_type: ParameterType::Text,
                optional: false,
            },
            Self::RelatedKeywords => ParameterField {
                parameter_type: ParameterType::Any,
                optional: true,
            },
        }
    }
}

impl fmt::Display for LinkTypeQueryPath {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CreatedById => fmt.write_str("createdById"),
            Self::UpdatedById => fmt.write_str("updatedById"),
            Self::RemovedById => fmt.write_str("removedById"),
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::BaseUri => fmt.write_str("baseUri"),
            Self::VersionedUri => fmt.write_str("versionedUri"),
            Self::Version => fmt.write_str("version"),
            Self::Title => fmt.write_str("title"),
            Self::Description => fmt.write_str("description"),
            Self::RelatedKeywords => fmt.write_str("relatedKeywords"),
        }
    }
}

impl TryFrom<Path> for LinkTypeQueryPath {
    type Error = Report<de::value::Error>;

    fn try_from(path: Path) -> Result<Self, Self::Error> {
        Self::deserialize(de::value::SeqDeserializer::new(
            path.segments.into_iter().map(|segment| segment.identifier),
        ))
        .into_report()
    }
}

/// A single token in a [`LinkTypeQueryPath`].
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LinkTypeQueryToken {
    OwnedById,
    CreatedById,
    UpdatedById,
    RemovedById,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    RelatedKeywords,
}

/// Deserializes a [`LinkTypeQueryPath`] from a string sequence.
pub struct LinkTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl LinkTypeQueryPathVisitor {
    pub const EXPECTING: &'static str = "one of `ownedById`, `createdById`, `updatedById`, \
                                         `removedById`, `baseUri`, `versionedUri`, `version`, \
                                         `title, `description`, or `relatedKeywords`";

    #[must_use]
    pub const fn new(position: usize) -> Self {
        Self { position }
    }
}

impl<'de> Visitor<'de> for LinkTypeQueryPathVisitor {
    type Value = LinkTypeQueryPath;

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
            LinkTypeQueryToken::OwnedById => LinkTypeQueryPath::OwnedById,
            LinkTypeQueryToken::CreatedById => LinkTypeQueryPath::CreatedById,
            LinkTypeQueryToken::UpdatedById => LinkTypeQueryPath::UpdatedById,
            LinkTypeQueryToken::RemovedById => LinkTypeQueryPath::RemovedById,
            LinkTypeQueryToken::BaseUri => LinkTypeQueryPath::BaseUri,
            LinkTypeQueryToken::VersionedUri => LinkTypeQueryPath::VersionedUri,
            LinkTypeQueryToken::Version => LinkTypeQueryPath::Version,
            LinkTypeQueryToken::Title => LinkTypeQueryPath::Title,
            LinkTypeQueryToken::Description => LinkTypeQueryPath::Description,
            LinkTypeQueryToken::RelatedKeywords => LinkTypeQueryPath::RelatedKeywords,
        })
    }
}
impl<'de> Deserialize<'de> for LinkTypeQueryPath {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(LinkTypeQueryPathVisitor::new(0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ontology::test_utils::create_path;

    fn convert_path(segments: impl IntoIterator<Item = &'static str>) -> LinkTypeQueryPath {
        LinkTypeQueryPath::try_from(create_path(segments)).expect("could not convert path")
    }

    fn deserialize(segments: impl IntoIterator<Item = &'static str>) -> LinkTypeQueryPath {
        LinkTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
            segments.into_iter(),
        ))
        .expect("could not deserialize path")
    }

    #[test]
    fn deserialization() {
        assert_eq!(deserialize(["baseUri"]), LinkTypeQueryPath::BaseUri);
        assert_eq!(deserialize(["version"]), LinkTypeQueryPath::Version);
        assert_eq!(
            deserialize(["versionedUri"]),
            LinkTypeQueryPath::VersionedUri
        );
        assert_eq!(deserialize(["ownedById"]), LinkTypeQueryPath::OwnedById);
        assert_eq!(deserialize(["title"]), LinkTypeQueryPath::Title);
        assert_eq!(deserialize(["description"]), LinkTypeQueryPath::Description);
        assert_eq!(
            deserialize(["relatedKeywords"]),
            LinkTypeQueryPath::RelatedKeywords
        );

        assert_eq!(
            LinkTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
                ["baseUri", "test"].into_iter()
            ))
            .expect_err(
                "managed to convert link type query path with multiple tokens when it should have \
                 errored"
            )
            .to_string(),
            "invalid length 2, expected 1 element in sequence"
        );
    }

    #[test]
    fn path_conversion() {
        assert_eq!(convert_path(["baseUri"]), LinkTypeQueryPath::BaseUri);
        assert_eq!(convert_path(["version"]), LinkTypeQueryPath::Version);
        assert_eq!(
            convert_path(["versionedUri"]),
            LinkTypeQueryPath::VersionedUri
        );
        assert_eq!(convert_path(["ownedById"]), LinkTypeQueryPath::OwnedById);
        assert_eq!(convert_path(["title"]), LinkTypeQueryPath::Title);
        assert_eq!(
            convert_path(["description"]),
            LinkTypeQueryPath::Description
        );
        assert_eq!(
            convert_path(["relatedKeywords"]),
            LinkTypeQueryPath::RelatedKeywords
        );

        assert_eq!(
            LinkTypeQueryPath::try_from(create_path(["baseUri", "invalid"]))
                .expect_err(
                    "managed to convert link type query path with multiple tokens when it should \
                     have errored"
                )
                .downcast_ref::<de::value::Error>()
                .expect("deserialization error not found in report")
                .to_string(),
            "invalid length 2, expected 1 element in sequence"
        );
    }
}
