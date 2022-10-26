use std::fmt;

use error_stack::{IntoReport, Report};
use serde::{
    de,
    de::{SeqAccess, Visitor},
    Deserialize, Deserializer,
};

use crate::{
    knowledge::{entity::EntityQueryPath, EntityQueryPathVisitor, Link},
    ontology::{LinkTypeQueryPath, LinkTypeQueryPathVisitor},
    store::query::{ParameterType, Path, QueryRecord, RecordPath},
};

#[derive(Debug, PartialEq, Eq)]
pub enum LinkQueryPath<'q> {
    OwnedById,
    CreatedById,
    Type(LinkTypeQueryPath),
    Source(Option<EntityQueryPath<'q>>),
    Target(Option<EntityQueryPath<'q>>),
    Index,
}

impl QueryRecord for Link {
    type Path<'q> = LinkQueryPath<'q>;
}

impl fmt::Display for LinkQueryPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::CreatedById => fmt.write_str("createdById"),
            Self::Type(path) => write!(fmt, "type.{path}"),
            Self::Source(None) => fmt.write_str("source"),
            Self::Source(Some(path)) => write!(fmt, "source.{path}"),
            Self::Target(None) => fmt.write_str("target"),
            Self::Target(Some(path)) => write!(fmt, "target.{path}"),
            Self::Index => fmt.write_str("index"),
        }
    }
}

impl RecordPath for LinkQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::OwnedById | Self::CreatedById | Self::Source(None) | Self::Target(None) => {
                ParameterType::Uuid
            }
            Self::Type(path) => path.expected_type(),
            Self::Source(Some(path)) | Self::Target(Some(path)) => path.expected_type(),
            Self::Index => ParameterType::Number,
        }
    }
}

impl<'q> TryFrom<Path> for LinkQueryPath<'q> {
    type Error = Report<de::value::Error>;

    fn try_from(path: Path) -> Result<Self, Self::Error> {
        Self::deserialize(de::value::SeqDeserializer::new(
            path.segments.into_iter().map(|segment| segment.identifier),
        ))
        .into_report()
    }
}

/// A single token in a [`LinkQueryPath`].
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LinkQueryToken {
    OwnedById,
    Type,
    Source,
    Target,
}

/// Deserializes a [`LinkQueryPath`] from a string sequence.
pub struct LinkQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl LinkQueryPathVisitor {
    #[must_use]
    pub const fn new(position: usize) -> Self {
        Self { position }
    }
}

impl<'de> Visitor<'de> for LinkQueryPathVisitor {
    type Value = LinkQueryPath<'de>;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a sequence consisting of `ownedById`, `type`, `source`, or `target`")
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
            LinkQueryToken::OwnedById => LinkQueryPath::OwnedById,
            LinkQueryToken::Type => {
                let link_type_query_path =
                    LinkTypeQueryPathVisitor::new(self.position).visit_seq(seq)?;

                LinkQueryPath::Type(link_type_query_path)
            }
            LinkQueryToken::Source => {
                let entity_type_query_path =
                    EntityQueryPathVisitor::new(self.position).visit_seq(seq)?;

                LinkQueryPath::Source(Some(entity_type_query_path))
            }
            LinkQueryToken::Target => {
                let entity_type_query_path =
                    EntityQueryPathVisitor::new(self.position).visit_seq(seq)?;

                LinkQueryPath::Target(Some(entity_type_query_path))
            }
        })
    }
}

impl<'de: 'k, 'k> Deserialize<'de> for LinkQueryPath<'k> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(LinkQueryPathVisitor::new(0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::query::test_utils::create_path;

    fn convert_path(segments: impl IntoIterator<Item = &'static str>) -> LinkQueryPath<'static> {
        LinkQueryPath::try_from(create_path(segments)).expect("Could not convert path")
    }

    fn deserialize<'q>(segments: impl IntoIterator<Item = &'q str>) -> LinkQueryPath<'q> {
        LinkQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
            segments.into_iter(),
        ))
        .expect("Could not deserialize path")
    }

    #[test]
    fn deserialization() {
        assert_eq!(deserialize(["ownedById"]), LinkQueryPath::OwnedById);
        assert_eq!(
            deserialize(["type", "version"]),
            LinkQueryPath::Type(LinkTypeQueryPath::Version)
        );
        assert_eq!(
            deserialize(["source", "version"]),
            LinkQueryPath::Source(Some(EntityQueryPath::Version))
        );
        assert_eq!(
            deserialize(["target", "version"]),
            LinkQueryPath::Target(Some(EntityQueryPath::Version))
        );

        assert_eq!(
            LinkQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
                ["ownedById", "test"].into_iter()
            ))
            .expect_err("Could convert link query path with multiple tokens")
            .to_string(),
            "invalid length 2, expected 1 element in sequence"
        );
    }

    #[test]
    fn path_conversion() {
        assert_eq!(convert_path(["ownedById"]), LinkQueryPath::OwnedById);
        assert_eq!(
            convert_path(["type", "version"]),
            LinkQueryPath::Type(LinkTypeQueryPath::Version)
        );
        assert_eq!(
            convert_path(["source", "version"]),
            LinkQueryPath::Source(Some(EntityQueryPath::Version))
        );
        assert_eq!(
            convert_path(["target", "version"]),
            LinkQueryPath::Target(Some(EntityQueryPath::Version))
        );
    }
}
